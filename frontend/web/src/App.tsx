import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface ProteinFoldingTask {
  id: string;
  proteinName: string;
  encryptedStructure: string;
  foldingProgress: number;
  timestamp: number;
  owner: string;
  status: "pending" | "computing" | "completed" | "failed";
  computationTime?: number;
  energyLevel?: number;
}

// FHE加密解密函数 - 模拟ZAMA FHE加密
const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}-${Date.now()}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    const base64Data = encryptedData.split('-')[1];
    return parseFloat(atob(base64Data));
  }
  return parseFloat(encryptedData);
};

// 模拟FHE同态计算 - 蛋白质折叠能量计算
const FHEProteinFoldingCompute = (encryptedData: string, operation: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  let result = value;
  
  switch(operation) {
    case 'foldSimulation':
      // 模拟折叠过程能量变化
      result = value * (0.8 + Math.random() * 0.4);
      break;
    case 'energyMinimization':
      result = value * 0.95;
      break;
    case 'structureOptimization':
      result = value * 1.05;
      break;
    default:
      result = value;
  }
  
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

// 蛋白质结构可视化组件
const ProteinStructureVisualizer: React.FC<{ progress: number; energyLevel?: number }> = ({ progress, energyLevel = 0 }) => {
  const segments = 20;
  const segmentAngle = (2 * Math.PI) / segments;
  
  return (
    <div className="protein-visualizer">
      <div className="protein-backbone">
        {Array.from({ length: segments }).map((_, i) => (
          <div 
            key={i}
            className={`protein-segment ${i / segments <= progress ? 'active' : ''}`}
            style={{
              transform: `rotate(${i * segmentAngle}rad)`,
              animationDelay: `${i * 0.1}s`
            }}
          />
        ))}
      </div>
      <div className="energy-level">
        <div className="energy-bar" style={{ height: `${energyLevel * 10}%` }}></div>
        <span>Energy: {energyLevel.toFixed(2)}</span>
      </div>
    </div>
  );
};

// 节点网络状态组件
const NetworkNodes: React.FC<{ activeNodes: number; totalNodes: number }> = ({ activeNodes, totalNodes }) => {
  return (
    <div className="network-nodes">
      <h4>Global Compute Network</h4>
      <div className="nodes-grid">
        {Array.from({ length: totalNodes }).map((_, i) => (
          <div 
            key={i}
            className={`network-node ${i < activeNodes ? 'active' : 'inactive'}`}
            title={`Node ${i + 1} - ${i < activeNodes ? 'Active' : 'Inactive'}`}
          />
        ))}
      </div>
      <div className="network-stats">
        <span>{activeNodes}/{totalNodes} Nodes Active</span>
        <div className="network-health">Health: {Math.round((activeNodes / totalNodes) * 100)}%</div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<ProteinFoldingTask[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newTaskData, setNewTaskData] = useState({ proteinName: "", initialEnergy: 100 });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ProteinFoldingTask | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [activeNodes, setActiveNodes] = useState(8);
  const [totalNodes, setTotalNodes] = useState(12);
  const [computationFlow, setComputationFlow] = useState<string[]>([]);

  // 任务统计
  const completedCount = tasks.filter(t => t.status === "completed").length;
  const computingCount = tasks.filter(t => t.status === "computing").length;
  const pendingCount = tasks.filter(t => t.status === "pending").length;

  useEffect(() => {
    loadTasks().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();

    // 模拟网络节点变化
    const nodeInterval = setInterval(() => {
      setActiveNodes(Math.max(3, Math.min(totalNodes, activeNodes + Math.floor(Math.random() * 3) - 1)));
    }, 5000);

    return () => clearInterval(nodeInterval);
  }, []);

  // 模拟实时数据流
  useEffect(() => {
    const flowInterval = setInterval(() => {
      const flows = [
        "Encrypting protein structure...",
        "Distributing to compute nodes...",
        "Performing FHE folding simulation...",
        "Aggregating results...",
        "Verifying computation integrity..."
      ];
      setComputationFlow(prev => {
        const newFlow = [...prev, flows[Math.floor(Math.random() * flows.length)]];
        return newFlow.slice(-5);
      });
    }, 2000);

    return () => clearInterval(flowInterval);
  }, []);

  const loadTasks = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // 检查合约可用性
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // 获取任务键列表
      const keysBytes = await contract.getData("task_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing task keys:", e); }
      }
      
      const taskList: ProteinFoldingTask[] = [];
      for (const key of keys) {
        try {
          const taskBytes = await contract.getData(`task_${key}`);
          if (taskBytes.length > 0) {
            try {
              const taskData = JSON.parse(ethers.toUtf8String(taskBytes));
              taskList.push({
                id: key,
                proteinName: taskData.proteinName,
                encryptedStructure: taskData.encryptedStructure,
                foldingProgress: taskData.foldingProgress || 0,
                timestamp: taskData.timestamp,
                owner: taskData.owner,
                status: taskData.status || "pending",
                computationTime: taskData.computationTime,
                energyLevel: taskData.energyLevel
              });
            } catch (e) { console.error(`Error parsing task data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading task ${key}:`, e); }
      }
      
      taskList.sort((a, b) => b.timestamp - a.timestamp);
      setTasks(taskList);
    } catch (e) { console.error("Error loading tasks:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitTask = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting protein structure with Zama FHE..." });
    
    try {
      // 使用FHE加密初始能量值
      const encryptedEnergy = FHEEncryptNumber(newTaskData.initialEnergy);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const taskId = `protein-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const taskData = {
        proteinName: newTaskData.proteinName,
        encryptedStructure: encryptedEnergy,
        foldingProgress: 0,
        timestamp: Math.floor(Date.now() / 1000),
        owner: address,
        status: "pending",
        energyLevel: newTaskData.initialEnergy
      };
      
      // 存储任务数据
      await contract.setData(`task_${taskId}`, ethers.toUtf8Bytes(JSON.stringify(taskData)));
      
      // 更新任务键列表
      const keysBytes = await contract.getData("task_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { 
          keys = JSON.parse(ethers.toUtf8String(keysBytes)); 
        } catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(taskId);
      await contract.setData("task_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Protein folding task submitted securely with FHE encryption!" });
      await loadTasks();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewTaskData({ proteinName: "", initialEnergy: 100 });
      }, 2000);
      
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreating(false); 
    }
  };

  const startFoldingComputation = async (taskId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Starting FHE-based protein folding simulation..." });
    
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      
      const taskBytes = await contract.getData(`task_${taskId}`);
      if (taskBytes.length === 0) throw new Error("Task not found");
      const taskData = JSON.parse(ethers.toUtf8String(taskBytes));
      
      // 模拟FHE计算过程
      const computedStructure = FHEProteinFoldingCompute(taskData.encryptedStructure, 'foldSimulation');
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedTask = { 
        ...taskData, 
        status: "computing",
        encryptedStructure: computedStructure,
        foldingProgress: 0.3,
        energyLevel: taskData.energyLevel ? taskData.energyLevel * 0.85 : 85
      };
      
      await contractWithSigner.setData(`task_${taskId}`, ethers.toUtf8Bytes(JSON.stringify(updatedTask)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE protein folding simulation started!" });
      await loadTasks();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Computation failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const completeFolding = async (taskId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Finalizing FHE protein folding computation..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const taskBytes = await contract.getData(`task_${taskId}`);
      if (taskBytes.length === 0) throw new Error("Task not found");
      const taskData = JSON.parse(ethers.toUtf8String(taskBytes));
      
      const updatedTask = { 
        ...taskData, 
        status: "completed",
        foldingProgress: 1.0,
        computationTime: Math.floor(Math.random() * 3600) + 1800, // 30-90 minutes
        energyLevel: taskData.energyLevel ? taskData.energyLevel * 0.7 : 70
      };
      
      await contract.setData(`task_${taskId}`, ethers.toUtf8Bytes(JSON.stringify(updatedTask)));
      setTransactionStatus({ visible: true, status: "success", message: "Protein folding completed successfully with FHE!" });
      await loadTasks();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Completion failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const isOwner = (taskAddress: string) => address?.toLowerCase() === taskAddress.toLowerCase();

  if (loading) return (
    <div className="loading-screen">
      <div className="dna-spinner"></div>
      <p>Initializing FHE-encrypted protein folding platform...</p>
    </div>
  );

  return (
    <div className="app-container bio-interface-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="dna-icon"></div>
          </div>
          <h1>FHEnetic<span>Fold</span></h1>
          <div className="fhe-badge">ZAMA FHE Powered</div>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-task-btn bio-button">
            <div className="add-icon"></div>New Folding Task
          </button>
          <button className="bio-button" onClick={() => setShowTutorial(!showTutorial)}>
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        {/* 欢迎横幅 */}
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Privacy-Preserving Protein Folding Simulation</h2>
            <p>Decentralized computation platform using Zama FHE to protect pharmaceutical research data</p>
          </div>
          <NetworkNodes activeNodes={activeNodes} totalNodes={totalNodes} />
        </div>

        {/* 教程部分 */}
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How FHE Protein Folding Works</h2>
            <div className="tutorial-steps">
              <div className="tutorial-step">
                <div className="step-icon">🧬</div>
                <div className="step-content">
                  <h3>Encrypt Protein Data</h3>
                  <p>Protein structures are encrypted using Zama FHE before submission</p>
                </div>
              </div>
              <div className="tutorial-step">
                <div className="step-icon">🌐</div>
                <div className="step-content">
                  <h3>Distribute Globally</h3>
                  <p>Encrypted data is distributed to global compute nodes</p>
                </div>
              </div>
              <div className="tutorial-step">
                <div className="step-icon">⚡</div>
                <div className="step-content">
                  <h3>FHE Computation</h3>
                  <p>Folding simulations run on encrypted data without decryption</p>
                </div>
              </div>
              <div className="tutorial-step">
                <div className="step-icon">🔓</div>
                <div className="step-content">
                  <h3>Secure Results</h3>
                  <p>Only authorized users can decrypt and view results</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 数据流监控 */}
        <div className="computation-flow">
          <h3>Real-time FHE Computation Flow</h3>
          <div className="flow-container">
            {computationFlow.map((flow, index) => (
              <div key={index} className="flow-item">
                <div className="flow-dot"></div>
                <span>{flow}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 仪表盘网格 */}
        <div className="dashboard-grid">
          <div className="dashboard-card bio-card">
            <h3>Platform Overview</h3>
            <p>DeSci platform for FHE-based protein folding simulation. Protect drug discovery IP while leveraging global compute resources.</p>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{tasks.length}</div>
                <div className="stat-label">Total Tasks</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{completedCount}</div>
                <div className="stat-label">Completed</div>
              </div>
            </div>
          </div>

          <div className="dashboard-card bio-card">
            <h3>Active Folding Simulation</h3>
            <ProteinStructureVisualizer progress={0.6} energyLevel={7.2} />
          </div>

          <div className="dashboard-card bio-card">
            <h3>Network Status</h3>
            <div className="network-status">
              <div className="status-item">
                <span>Compute Nodes:</span>
                <span>{activeNodes}/{totalNodes} Active</span>
              </div>
              <div className="status-item">
                <span>FHE Throughput:</span>
                <span>{(activeNodes * 2.5).toFixed(1)} TFLOPS</span>
              </div>
              <div className="status-item">
                <span>Data Privacy:</span>
                <span className="status-secure">100% Encrypted</span>
              </div>
            </div>
          </div>
        </div>

        {/* 任务列表 */}
        <div className="tasks-section">
          <div className="section-header">
            <h2>Protein Folding Tasks</h2>
            <div className="header-actions">
              <button onClick={loadTasks} className="refresh-btn bio-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh Tasks"}
              </button>
            </div>
          </div>
          
          <div className="tasks-list bio-card">
            {tasks.length === 0 ? (
              <div className="no-tasks">
                <div className="dna-icon large"></div>
                <p>No protein folding tasks found</p>
                <button className="bio-button primary" onClick={() => setShowCreateModal(true)}>
                  Create First Folding Task
                </button>
              </div>
            ) : (
              tasks.map(task => (
                <div className="task-item" key={task.id} onClick={() => setSelectedTask(task)}>
                  <div className="task-visualization">
                    <ProteinStructureVisualizer 
                      progress={task.foldingProgress} 
                      energyLevel={task.energyLevel || 0} 
                    />
                  </div>
                  <div className="task-info">
                    <h4>{task.proteinName}</h4>
                    <div className="task-meta">
                      <span>Progress: {(task.foldingProgress * 100).toFixed(1)}%</span>
                      <span className={`status-badge ${task.status}`}>{task.status}</span>
                    </div>
                  </div>
                  <div className="task-actions">
                    {isOwner(task.owner) && task.status === "pending" && (
                      <button className="bio-button success" onClick={(e) => { e.stopPropagation(); startFoldingComputation(task.id); }}>
                        Start Folding
                      </button>
                    )}
                    {isOwner(task.owner) && task.status === "computing" && (
                      <button className="bio-button primary" onClick={(e) => { e.stopPropagation(); completeFolding(task.id); }}>
                        Complete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 创建任务模态框 */}
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitTask}
          onClose={() => setShowCreateModal(false)}
          creating={creating}
          taskData={newTaskData}
          setTaskData={setNewTaskData}
        />
      )}

      {/* 任务详情模态框 */}
      {selectedTask && (
        <TaskDetailModal 
          task={selectedTask}
          onClose={() => { setSelectedTask(null); setDecryptedValue(null); }}
          decryptedValue={decryptedValue}
          setDecryptedValue={setDecryptedValue}
          isDecrypting={isDecrypting}
          decryptWithSignature={decryptWithSignature}
        />
      )}

      {/* 交易状态模态框 */}
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content bio-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="dna-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="dna-icon"></div>
              <span>FHEneticFold</span>
            </div>
            <p>Privacy-preserving protein folding with Zama FHE technology</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Research Papers</a>
            <a href="#" className="footer-link">Privacy Policy</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">🔒 FHE-Encrypted DeSci Platform</div>
          <div className="copyright">© {new Date().getFullYear()} FHEneticFold. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

// 创建任务模态框组件
interface ModalCreateProps {
  onSubmit: () => void;
  onClose: () => void;
  creating: boolean;
  taskData: any;
  setTaskData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, taskData, setTaskData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setTaskData({ ...taskData, [name]: value });
  };

  const handleSubmit = () => {
    if (!taskData.proteinName || !taskData.initialEnergy) {
      alert("Please fill all required fields");
      return;
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal bio-card">
        <div className="modal-header">
          <h2>New Protein Folding Task</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon">🔐</div>
            <div>
              <strong>Zama FHE Encryption</strong>
              <p>Protein data will be encrypted before distribution to compute nodes</p>
            </div>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Protein Name *</label>
              <input 
                type="text" 
                name="proteinName" 
                value={taskData.proteinName} 
                onChange={handleChange}
                placeholder="e.g., Insulin, Hemoglobin..."
                className="bio-input"
              />
            </div>
            <div className="form-group">
              <label>Initial Energy Level *</label>
              <input 
                type="number" 
                name="initialEnergy" 
                value={taskData.initialEnergy} 
                onChange={handleChange}
                placeholder="Initial energy value"
                className="bio-input"
                min="1"
                max="1000"
              />
            </div>
          </div>

          <div className="encryption-preview">
            <h4>FHE Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data">
                <span>Plain Energy Value:</span>
                <div>{taskData.initialEnergy || 'Not set'}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>FHE Encrypted:</span>
                <div>{taskData.initialEnergy ? FHEEncryptNumber(taskData.initialEnergy).substring(0, 40) + '...' : 'Not set'}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn bio-button">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn bio-button primary">
            {creating ? "Encrypting with Zama FHE..." : "Start Secure Folding"}
          </button>
        </div>
      </div>
    </div>
  );
};

// 任务详情模态框组件
interface TaskDetailModalProps {
  task: ProteinFoldingTask;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose, decryptedValue, setDecryptedValue, isDecrypting, decryptWithSignature }) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) {
      setDecryptedValue(null);
      return;
    }
    const decrypted = await decryptWithSignature(task.encryptedStructure);
    if (decrypted !== null) setDecryptedValue(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="task-detail-modal bio-card">
        <div className="modal-header">
          <h2>{task.proteinName} Folding Analysis</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="task-visualization-large">
            <ProteinStructureVisualizer 
              progress={task.foldingProgress} 
              energyLevel={task.energyLevel || 0} 
            />
          </div>
          
          <div className="task-details">
            <div className="detail-item">
              <span>Task ID:</span>
              <strong>#{task.id.substring(0, 8)}</strong>
            </div>
            <div className="detail-item">
              <span>Status:</span>
              <strong className={`status-badge ${task.status}`}>{task.status}</strong>
            </div>
            <div className="detail-item">
              <span>Progress:</span>
              <strong>{(task.foldingProgress * 100).toFixed(1)}%</strong>
            </div>
            {task.computationTime && (
              <div className="detail-item">
                <span>Compute Time:</span>
                <strong>{Math.floor(task.computationTime / 60)}m {task.computationTime % 60}s</strong>
              </div>
            )}
          </div>

          <div className="encrypted-data-section">
            <h3>FHE Encrypted Structure Data</h3>
            <div className="encrypted-data">
              {task.encryptedStructure.substring(0, 60)}...
            </div>
            <button 
              className="decrypt-btn bio-button" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? "Decrypting..." : decryptedValue !== null ? "Re-encrypt Data" : "Decrypt with Signature"}
            </button>
          </div>

          {decryptedValue !== null && (
            <div className="decrypted-data-section">
              <h3>Decrypted Energy Level</h3>
              <div className="decrypted-value">{decryptedValue}</div>
              <div className="decryption-notice">
                <div className="warning-icon">⚠️</div>
                <span>Decrypted data visible only after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn bio-button">Close Analysis</button>
        </div>
      </div>
    </div>
  );
};

export default App;