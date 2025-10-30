pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ProteinFoldingFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    struct Batch {
        uint256 id;
        bool active;
        uint256 totalScore;
        uint256 submissionCount;
    }
    uint256 public currentBatchId;
    mapping(uint256 => Batch) public batches;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PauseToggled(bool paused);
    event CooldownSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId, uint256 totalScore, uint256 submissionCount);
    event FoldingDataSubmitted(address indexed provider, uint256 indexed batchId, euint32 encryptedScore);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 decryptedScore);

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotActive();
    error BatchAlreadyActive();
    error InvalidBatchId();
    error ReplayAttempt();
    error StateMismatch();
    error NotInitialized();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 60; // Default 1 minute cooldown
        currentBatchId = 1; // Start with batch ID 1
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }

    function setCooldownSeconds(uint256 _cooldownSeconds) external onlyOwner {
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = _cooldownSeconds;
        emit CooldownSet(oldCooldown, _cooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (batches[currentBatchId].active) revert BatchAlreadyActive();
        batches[currentBatchId] = Batch({ id: currentBatchId, active: true, totalScore: 0, submissionCount: 0 });
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner whenNotPaused {
        if (batchId != currentBatchId) revert InvalidBatchId();
        Batch storage batch = batches[batchId];
        if (!batch.active) revert BatchNotActive();

        batch.active = false;
        emit BatchClosed(batchId, batch.totalScore, batch.submissionCount);
        currentBatchId++;
    }

    function submitFoldingData(euint32 encryptedScore) external onlyProvider whenNotPaused checkSubmissionCooldown {
        if (!FHE.isInitialized(encryptedScore)) revert NotInitialized();
        Batch storage batch = batches[currentBatchId];
        if (!batch.active) revert BatchNotActive();

        // Add encrypted score to batch's total score
        batch.totalScore = FHE.toBytes32(FHE.add(FHE.asEuint32(batch.totalScore), encryptedScore));
        batch.submissionCount++;
        lastSubmissionTime[msg.sender] = block.timestamp;

        emit FoldingDataSubmitted(msg.sender, currentBatchId, encryptedScore);
    }

    function requestBatchScoreDecryption() external onlyOwner whenNotPaused checkDecryptionCooldown {
        Batch storage batch = batches[currentBatchId];
        if (batch.active) revert BatchNotActive(); // Can only decrypt closed batches
        if (batch.submissionCount == 0) revert(); // Nothing to decrypt

        euint32 encryptedTotalScore = FHE.asEuint32(batch.totalScore);
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(encryptedTotalScore);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({ batchId: batch.id, stateHash: stateHash, processed: false });
        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        emit DecryptionRequested(requestId, batch.id);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // Rebuild cts array in the exact same order as during requestDecryption
        Batch storage batch = batches[decryptionContexts[requestId].batchId];
        euint32 encryptedTotalScore = FHE.asEuint32(batch.totalScore);
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(encryptedTotalScore);

        // State verification: ensure contract state hasn't changed since decryption request
        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        // Proof verification
        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode cleartexts in the same order
        uint256 decryptedScore = abi.decode(cleartexts, (uint256));
        decryptionContexts[requestId].processed = true;

        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, decryptedScore);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 _value) internal {
        if (!FHE.isInitialized(_value)) {
            FHE.init(_value);
        }
    }

    function _requireInitialized(euint32 _value) internal view {
        if (!FHE.isInitialized(_value)) {
            revert NotInitialized();
        }
    }
}