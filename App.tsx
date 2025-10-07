import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  Eye, 
  CreditCard, 
  Globe, 
  Users, 
  CheckCircle, 
  Scan,
  Wallet,
  Lock,
  Zap,
  Receipt,
  User,
  LogOut,
  DollarSign,
  Store,
  Clock,
  AlertCircle,
  Camera,
  Smartphone,
  RefreshCw,
  X,
  UserCheck,
  Shield,
  ArrowRight,
  Server,
  Database
} from 'lucide-react';

// --- TYPES ---

/** Represents a user, who can be a 'client' or a 'merchant'. */
interface User {
  id: string;
  name: string;
  email: string;
  irisHash: string;
  walletId: string;
  bankLinked: boolean;
  userType: 'client' | 'merchant';
  merchantName?: string;
}

/** Represents a processed transaction. */
interface Transaction {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: string;
  merchantId?: string;
  merchantName?: string;
  clientId?: string;
  clientName?: string;
}

/** Represents a payment request initiated by a merchant. */
interface PaymentRequest {
  id: string;
  merchantId: string;
  merchantName: string;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: string;
}

// 1. Shared Props for both Dashboards
interface SharedDashboardProps {
  user: User;
  transactions: Transaction[];
  requests: PaymentRequest[];
  onViewReceipt: (tx: Transaction, backPage: 'client-dashboard' | 'merchant-dashboard') => void;
  setError: (msg: string | null) => void;
}

// 2. Client Dashboard Specific Props
interface ClientDashboardProps extends SharedDashboardProps {
  walletBalance: number;
  onNavigate: (page: Page) => void;
}

// 3. Merchant Dashboard Specific Props
interface MerchantDashboardProps extends SharedDashboardProps {
  onCreateRequest: (amount: number, currency: string) => Promise<void>;
  onNavigate: (page: Page) => void;
}

// 4. Page types
type Page = 'landing' | 'features' | 'workflow' | 'security' | 'scanner' | 'register' | 'login' | 'client-dashboard' | 'merchant-dashboard' | 'receipt';

// 5. Registration/Login Props
interface AuthPageProps {
    onSuccess: (user: User) => void;
    onBack?: () => void;
    onNavigate: (page: Page) => void;
}

// 6. Scanner Page Props
interface ScannerPageProps {
    user: User | null;
    onPaymentSuccess: (tx: Transaction) => void;
    setError: (msg: string | null) => void;
    onNavigate: (page: Page) => void;
    registeredUsers: Pick<User, 'id' | 'name' | 'userType' | 'merchantName'>[];
}

// 7. Receipt Page Props
interface ReceiptPageProps {
    tx: Transaction;
    onBack: () => void;
}

// --- MOCK API DATA & HELPERS ---

// Base URL is irrelevant in a mock, but good practice
const API_BASE = 'http://localhost:5000/api'; 

const MOCK_USERS: User[] = [
    { id: 'client-001', name: 'Alice Smith', email: 'alice@client.com', irisHash: 'hash-alice1234', walletId: 'w-001', bankLinked: true, userType: 'client' },
    { id: 'client-002', name: 'Bob Johnson', email: 'bob@client.com', irisHash: 'hash-bob5678', walletId: 'w-002', bankLinked: true, userType: 'client' },
    { id: 'merchant-001', name: 'Charlie Merchant', email: 'charlie@merchant.com', irisHash: 'hash-charlie9012', walletId: 'w-m01', bankLinked: true, userType: 'merchant', merchantName: 'Groovy Groceries' },
];

let MOCK_TRANSACTIONS: Transaction[] = [
    { id: 'tx-001', amount: 45.99, currency: 'USD', status: 'completed', timestamp: '2025-09-28T10:00:00Z', merchantName: 'Groovy Groceries', clientId: 'client-001' },
    { id: 'tx-002', amount: 12.50, currency: 'USD', status: 'completed', timestamp: '2025-09-28T11:30:00Z', merchantName: 'Coffee Corner', clientId: 'client-001' },
    { id: 'tx-003', amount: 88.00, currency: 'USD', status: 'completed', timestamp: '2025-09-27T15:45:00Z', merchantName: 'Groovy Groceries', clientId: 'client-002' },
];

let MOCK_WALLET_BALANCE = 500.00; // Shared balance for mock purposes

// --- IRIS CAPTURE COMPONENT LOGIC (Bundled Inline) ---

/** Generates a mock iris hash to simulate the biometric key generation. */
const generateIrisHash = (name: string): Promise<string> => {
    return new Promise((resolve) => {
        // MOCK: Generate a simple hash string based on user name
        const prefix = name.toLowerCase().replace(/\s/g, '');
        const mockHash = `hash-${prefix}-${Date.now().toString().slice(-4)}`;
        setTimeout(() => {
            resolve(mockHash);
        }, 1500); // Simulate processing time
    });
};

/** Attempts to initialize the webcam stream. Returns the stream, or a string code on failure. */
const initWebcam = async (videoRef: React.RefObject<HTMLVideoElement>): Promise<MediaStream | 'PERMISSION_DENIED' | 'OTHER_ERROR' | null> => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                return stream;
            }
            return null;
        } catch (err) {
            const error = err as Error;
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError' || error.message.includes('denied')) {
                return 'PERMISSION_DENIED';
            }
            return 'OTHER_ERROR';
        }
    }
    return null;
};

interface IrisCaptureProps {
    onCapture: (hash: string) => void;
    title: string;
    subtitle: string;
    status: 'idle' | 'capturing' | 'success' | 'error';
    setStatus: (status: 'idle' | 'capturing' | 'success' | 'error') => void;
    errorMessage: string | null; // For API errors passed from parent
    userNameForHash: string; // Used for registration
}

const IrisCapture: React.FC<IrisCaptureProps> = ({ onCapture, title, subtitle, status, setStatus, errorMessage, userNameForHash }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null);
    const [isMockMode, setIsMockMode] = useState(false);

    useEffect(() => {
        initWebcam(videoRef).then(result => {
            if (result === 'PERMISSION_DENIED' || result === 'OTHER_ERROR' || result === null) {
                setIsMockMode(true);
                setLocalErrorMessage("Camera access failed. Proceeding in **Mock Mode** (biometric hash will be simulated).");
                setStatus('idle');
            } else {
                streamRef.current = result as MediaStream;
                setStatus('idle');
                setLocalErrorMessage(null);
                setIsMockMode(false);
            }
        }).catch(e => {
            setStatus('error');
            setLocalErrorMessage("Critical initialization error.");
        });

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [setStatus]);

    const handleCaptureClick = async () => {
        if (status === 'capturing') return;
        
        if (!isMockMode && !streamRef.current) {
             setLocalErrorMessage("Webcam not active. Cannot capture.");
             return;
        }

        setStatus('capturing');
        setLocalErrorMessage(null); 
        
        try {
            // Use the provided user name to create a semi-deterministic hash for mock auth
            const hash = await generateIrisHash(userNameForHash); 
            onCapture(hash);
        } catch (e) {
            setStatus('error');
            setLocalErrorMessage("Internal mock hash generation failed.");
        }
    };

    const statusMap = {
        idle: { icon: <Camera className="w-10 h-10 text-gray-400" />, message: subtitle, color: 'text-gray-600' },
        capturing: { icon: <Zap className="w-10 h-10 text-yellow-500 animate-pulse" />, message: 'Scanning and generating hash...', color: 'text-yellow-600' },
        success: { icon: <CheckCircle className="w-10 h-10 text-green-500" />, message: 'Iris captured successfully!', color: 'text-green-600' },
        error: { icon: <AlertCircle className="w-10 h-10 text-red-500" />, message: errorMessage || 'Error accessing camera or processing iris.', color: 'text-red-600' },
    };

    const currentStatus = statusMap[status];
    const displayMessage = errorMessage || localErrorMessage || currentStatus.message;
    const isDisabled = status === 'capturing' || (status === 'error' && !isMockMode);

    return (
        <div className="max-w-md w-full text-center p-6 bg-white rounded-xl shadow-2xl border-t-4 border-blue-500">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">{title}</h2>
            
            {/* Webcam Feed / Scanner Visual */}
            <div className="h-64 bg-gray-900 rounded-lg flex items-center justify-center mb-6 overflow-hidden relative border-4 border-gray-700">
                {/* Video element for live feed */}
                <video ref={videoRef} autoPlay playsInline muted 
                    className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-500 ${isMockMode ? 'opacity-20' : 'opacity-100'}`} 
                    style={{ objectFit: 'cover' }}
                />
                {/* Mock Mode Overlay */}
                {isMockMode && (
                    <div className="absolute inset-0 bg-gray-900/90 text-white flex flex-col items-center justify-center p-4">
                        <Smartphone className="w-12 h-12 mb-2 text-red-400" />
                        <p className="font-semibold">Mock Mode Active</p>
                        <p className="text-xs text-gray-300">Camera unavailable. Simulating scan.</p>
                    </div>
                )}
                {/* Scanning Animation */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className={`w-3/4 h-3/4 border-4 rounded-full transition-all duration-300 
                        ${status === 'capturing' ? 'border-yellow-500 animate-pulse border-dashed' : 'border-blue-500 opacity-50'}`}></div>
                    <Eye className="absolute w-8 h-8 text-white opacity-90" />
                </div>
            </div>
            
            {/* Status Display */}
            <div className="flex flex-col items-center justify-center mb-6 min-h-[4rem]">
                {currentStatus.icon}
                <p className={`mt-2 font-medium text-sm text-center ${currentStatus.color}`} 
                    dangerouslySetInnerHTML={{ __html: displayMessage }}>
                </p>
            </div>

            {/* Capture Button */}
            <button 
                onClick={handleCaptureClick}
                className={`w-full text-white px-6 py-3 rounded-lg flex items-center justify-center shadow-lg transition duration-300 font-semibold mb-4
                    ${isDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'}`
                }
                disabled={isDisabled}
            >
                {status === 'capturing' ? (
                    <>
                        <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> Processing...
                    </>
                ) : (
                    <>
                        <Scan className="w-5 h-5 mr-2" /> Capture Iris {isMockMode && "(Mock)"}
                    </>
                )}
            </button>

            {/* Reset button if error state */}
            {(status === 'error' || status === 'success') && (
                <button 
                    onClick={() => { setStatus('idle'); onCapture(''); }} // Resetting capture sends empty hash to parent
                    className="w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-lg flex items-center justify-center shadow-sm hover:bg-gray-200 transition text-sm"
                >
                    <X className="w-4 h-4 mr-2" /> Start Over
                </button>
            )}
        </div>
    );
};
// --- END IRIS CAPTURE COMPONENT LOGIC ---

// --- SUB-COMPONENTS ---

interface ModalProps {
    title: string;
    message: string;
    onClose: () => void;
    icon: React.ReactNode;
    color: 'red' | 'green' | 'blue';
}

const Modal: React.FC<ModalProps> = ({ title, message, onClose, icon, color }) => {
    const colorClasses = {
        red: { bg: 'bg-red-500', hover: 'hover:bg-red-600', text: 'text-red-600' },
        green: { bg: 'bg-green-500', hover: 'hover:bg-green-600', text: 'text-green-600' },
        blue: { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', text: 'text-blue-600' },
    }[color];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div className="bg-white p-8 rounded-xl shadow-2xl max-w-sm w-full transform transition-all scale-100 duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col items-center">
                    <div className={`p-3 rounded-full bg-opacity-10 ${colorClasses.text}`}>{icon}</div>
                    <h3 className={`text-2xl font-bold mt-3 ${colorClasses.text}`}>{title}</h3>
                </div>
                <p className="text-gray-700 text-center my-4">{message}</p>
                <button 
                    onClick={onClose} 
                    className={`w-full text-white px-4 py-3 rounded-lg font-semibold transition ${colorClasses.bg} ${colorClasses.hover}`}
                >
                    {color === 'red' ? 'Dismiss' : 'OK'}
                </button>
            </div>
        </div>
    );
};

const LandingPage: React.FC<{ onNavigate: (page: Page) => void }> = ({ onNavigate }) => (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center pt-24 px-4">
        <div className="max-w-4xl text-center">
            <h1 className="text-6xl font-extrabold text-gray-900 leading-tight mb-4">
                <Eye className="inline w-12 h-12 text-blue-600 mr-3" />
                IrisPay: Pay with a Glance.
            </h1>
            <p className="text-xl text-gray-600 mb-10">
                The future of payment is here. Secure, instant, and frictionless transactions powered by biometric identity.
            </p>
            <div className="flex justify-center space-x-4">
                <button 
                    onClick={() => onNavigate('register')}
                    className="bg-blue-600 text-white px-8 py-4 rounded-xl text-lg font-semibold shadow-lg hover:bg-blue-700 transition transform hover:scale-[1.02] active:scale-[0.98]"
                >
                    <UserCheck className="inline w-5 h-5 mr-2" /> Get Started (Register)
                </button>
                <button 
                    onClick={() => onNavigate('login')}
                    className="bg-gray-200 text-gray-800 px-8 py-4 rounded-xl text-lg font-semibold shadow-lg hover:bg-gray-300 transition transform hover:scale-[1.02] active:scale-[0.98]"
                >
                    <User className="inline w-5 h-5 mr-2" /> Log In
                </button>
            </div>
        </div>
        
        <div className="mt-20 grid md:grid-cols-3 gap-8 max-w-6xl w-full text-left">
            {[
                { icon: <Lock className="w-8 h-8 text-blue-600" />, title: "Unmatched Security", desc: "Your iris map is your secure key, eliminating passwords and card fraud." },
                { icon: <Zap className="w-8 h-8 text-green-600" />, title: "Instant Speed", desc: "Complete transactions in under a second—faster than NFC or chip cards." },
                { icon: <Globe className="w-8 h-8 text-yellow-600" />, title: "Global Acceptance", desc: "A universal, bank-agnostic payment standard for merchants worldwide." },
            ].map((item, index) => (
                <div key={index} className="bg-white p-6 rounded-xl shadow-md border border-gray-100 hover:shadow-xl transition duration-300">
                    {item.icon}
                    <h3 className="text-xl font-bold text-gray-800 mt-4 mb-2">{item.title}</h3>
                    <p className="text-gray-600">{item.desc}</p>
                </div>
            ))}
        </div>
        
        <p className="text-sm text-gray-400 mt-16 mb-8">
            <button onClick={() => onNavigate('features')} className="text-blue-500 hover:text-blue-700 underline">Learn More about IrisPay</button>
        </p>
    </div>
);

const FeaturesPage: React.FC = () => (
    <div className="min-h-screen bg-white pt-24 px-4 pb-12">
        <div className="max-w-5xl mx-auto">
            <h2 className="text-5xl font-extrabold text-center text-gray-900 mb-10">Core Features of IrisPay</h2>
            <div className="space-y-16">
                
                {/* Feature 1: Biometric Authentication */}
                <div className="flex flex-col md:flex-row items-center bg-blue-50/70 p-8 rounded-2xl shadow-lg">
                    <div className="md:w-1/2 p-4">
                        <h3 className="text-3xl font-bold text-blue-700 flex items-center mb-4"><Eye className="w-6 h-6 mr-2" /> Iris Biometric Key</h3>
                        <p className="text-gray-700 text-lg mb-4">
                            IrisPay generates a unique, irreversible cryptographic key from your iris pattern. This key is **never** stored as an image, ensuring maximum privacy and security.
                        </p>
                        <ul className="list-disc list-inside text-gray-600 space-y-2">
                            <li>Cryptographic Hashing (irreversible)</li>
                            <li>Zero-Trust Authentication</li>
                            <li>Instant Verification</li>
                        </ul>
                    </div>
                    <div className="md:w-1/2 flex justify-center p-4">
                         <div className="w-48 h-48 bg-gray-900 rounded-full flex items-center justify-center shadow-inner">
                            <Lock className="w-16 h-16 text-blue-400 animate-pulse" />
                        </div>
                    </div>
                </div>

                {/* Feature 2: Merchant Workflow */}
                <div className="flex flex-col md:flex-row-reverse items-center bg-green-50/70 p-8 rounded-2xl shadow-lg">
                    <div className="md:w-1/2 p-4">
                        <h3 className="text-3xl font-bold text-green-700 flex items-center mb-4"><Store className="w-6 h-6 mr-2" /> Frictionless Merchant POS</h3>
                        <p className="text-gray-700 text-lg mb-4">
                            Merchants simply generate a one-time QR code for the payment amount. The client scans the QR, looks at the scanner, and the transaction is instantly authorized.
                        </p>
                        <ul className="list-disc list-inside text-gray-600 space-y-2">
                            <li>Easy Integration (API/POS Terminal)</li>
                            <li>Real-time Settlement</li>
                            <li>Lower Transaction Fees (Mock)</li>
                        </ul>
                    </div>
                    <div className="md:w-1/2 flex justify-center p-4">
                        <Scan className="w-48 h-48 text-green-500" />
                    </div>
                </div>

                {/* Feature 3: Client Wallet Management */}
                <div className="flex flex-col md:flex-row items-center bg-yellow-50/70 p-8 rounded-2xl shadow-lg">
                    <div className="md:w-1/2 p-4">
                        <h3 className="text-3xl font-bold text-yellow-700 flex items-center mb-4"><Wallet className="w-6 h-6 mr-2" /> Integrated Digital Wallet</h3>
                        <p className="text-gray-700 text-lg mb-4">
                            Connect your existing bank accounts or credit cards to fund your IrisPay digital wallet. All transactions are securely audited and receipted instantly.
                        </p>
                        <ul className="list-disc list-inside text-gray-600 space-y-2">
                            <li>Transaction History</li>
                            <li>Bank Linking (Mock)</li>
                            <li>Instant Digital Receipts</li>
                        </ul>
                    </div>
                    <div className="md:w-1/2 flex justify-center p-4">
                        <CreditCard className="w-48 h-48 text-yellow-500" />
                    </div>
                </div>

            </div>
        </div>
    </div>
);

const WorkflowPage: React.FC = () => (
    <div className="min-h-screen bg-gray-100 pt-24 px-4 pb-12">
        <div className="max-w-4xl mx-auto">
            <h2 className="text-5xl font-extrabold text-center text-gray-900 mb-12">How a Payment Works</h2>
            
            <div className="space-y-8 relative">
                
                {/* Timeline Connector */}
                <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-1 bg-blue-300 hidden md:block"></div>

                {/* Step 1 */}
                <div className="flex justify-start md:justify-center">
                    <div className="md:w-1/2 md:pr-12 text-right">
                        <div className="relative p-6 bg-white rounded-xl shadow-xl transition-all hover:scale-[1.03] duration-300">
                            <div className="absolute right-[-1.5rem] top-1/2 transform -translate-y-1/2 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg hidden md:flex">1</div>
                            <h3 className="text-2xl font-bold text-blue-600 mb-2 flex items-center justify-end"><DollarSign className="w-5 h-5 mr-2" /> Merchant Initiates Request</h3>
                            <p className="text-gray-700">The merchant enters the amount and generates a temporary QR code displaying the payment details on the terminal.</p>
                        </div>
                    </div>
                    <div className="w-1/2 hidden md:block"></div>
                </div>

                {/* Step 2 */}
                <div className="flex justify-end md:justify-center">
                    <div className="w-1/2 hidden md:block"></div>
                    <div className="md:w-1/2 md:pl-12 text-left">
                        <div className="relative p-6 bg-white rounded-xl shadow-xl transition-all hover:scale-[1.03] duration-300">
                            <div className="absolute left-[-1.5rem] top-1/2 transform -translate-y-1/2 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg hidden md:flex">2</div>
                            <h3 className="text-2xl font-bold text-blue-600 mb-2 flex items-center"><Smartphone className="w-5 h-5 mr-2" /> Client Scans QR</h3>
                            <p className="text-gray-700">The client uses the IrisPay app on their phone to scan the QR code, securely linking their identity to the payment request.</p>
                        </div>
                    </div>
                </div>
                
                {/* Step 3 */}
                <div className="flex justify-start md:justify-center">
                    <div className="md:w-1/2 md:pr-12 text-right">
                        <div className="relative p-6 bg-white rounded-xl shadow-xl transition-all hover:scale-[1.03] duration-300">
                            <div className="absolute right-[-1.5rem] top-1/2 transform -translate-y-1/2 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg hidden md:flex">3</div>
                            <h3 className="text-2xl font-bold text-blue-600 mb-2 flex items-center justify-end"><Eye className="w-5 h-5 mr-2" /> Biometric Verification</h3>
                            <p className="text-gray-700">The client simply looks at the IrisPay scanner. Their iris map is converted to a hash and sent for cryptographic verification.</p>
                        </div>
                    </div>
                    <div className="w-1/2 hidden md:block"></div>
                </div>

                {/* Step 4 */}
                <div className="flex justify-end md:justify-center">
                    <div className="w-1/2 hidden md:block"></div>
                    <div className="md:w-1/2 md:pl-12 text-left">
                        <div className="relative p-6 bg-white rounded-xl shadow-xl transition-all hover:scale-[1.03] duration-300">
                            <div className="absolute left-[-1.5rem] top-1/2 transform -translate-y-1/2 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg hidden md:flex">4</div>
                            <h3 className="text-2xl font-bold text-blue-600 mb-2 flex items-center"><CheckCircle className="w-5 h-5 mr-2" /> Instant Transaction</h3>
                            <p className="text-gray-700">Upon successful verification, the payment is authorized and deducted from the client's wallet. Both parties receive an instant confirmation.</p>
                        </div>
                    </div>
                </div>
            </div>
            
        </div>
    </div>
);

const SecurityPage: React.FC = () => (
    <div className="min-h-screen bg-gray-50 pt-24 px-4 pb-12">
        <div className="max-w-5xl mx-auto">
            <h2 className="text-5xl font-extrabold text-center text-gray-900 mb-12">The Power of Biometric Security</h2>
            
            <div className="grid md:grid-cols-2 gap-10">
                
                {/* Card 1: Iris Hashing */}
                <div className="bg-white p-8 rounded-2xl shadow-xl border-t-4 border-purple-500">
                    <div className="flex items-center mb-4">
                        <Database className="w-8 h-8 text-purple-600 mr-3" />
                        <h3 className="text-2xl font-bold text-gray-800">Irreversible Hashing</h3>
                    </div>
                    <p className="text-gray-600 mb-4">
                        Your biometric data (iris scan) is immediately converted into a cryptographic **one-way hash**. This means the original image cannot be recreated from the stored hash. We store a key, not your identity.
                    </p>
                    <ul className="list-disc list-inside text-gray-700 ml-4 space-y-1">
                        <li>No raw biometric data stored.</li>
                        <li>Non-reversible encryption algorithm.</li>
                        <li>Eliminates centralized biometric honeypots.</li>
                    </ul>
                </div>

                {/* Card 2: Fraud Prevention */}
                <div className="bg-white p-8 rounded-2xl shadow-xl border-t-4 border-red-500">
                    <div className="flex items-center mb-4">
                        <Shield className="w-8 h-8 text-red-600 mr-3" />
                        <h3 className="text-2xl font-bold text-gray-800">Zero Card Fraud Risk</h3>
                    </div>
                    <p className="text-gray-600 mb-4">
                        IrisPay bypasses traditional card infrastructure, making skimming, unauthorized card-present, and card-not-present fraud impossible. Your iris is always with you.
                    </p>
                    <ul className="list-disc list-inside text-gray-700 ml-4 space-y-1">
                        <li>No PINS or plastic cards required.</li>
                        <li>Verification is tied to the physical self.</li>
                        <li>Real-time anti-spoofing detection (Mock).</li>
                    </ul>
                </div>

                {/* Card 3: Wallet Protection */}
                <div className="bg-white p-8 rounded-2xl shadow-xl border-t-4 border-green-500">
                    <div className="flex items-center mb-4">
                        <Lock className="w-8 h-8 text-green-600 mr-3" />
                        <h3 className="text-2xl font-bold text-gray-800">Wallet Lock & Audit</h3>
                    </div>
                    <p className="text-gray-600 mb-4">
                        Every transaction requires a unique, one-time biometric match. Comprehensive transaction logs are available immediately, providing full control and auditability over your funds.
                    </p>
                    <ul className="list-disc list-inside text-gray-700 ml-4 space-y-1">
                        <li>Instant transaction visibility.</li>
                        <li>Multi-factor options available for large sums.</li>
                        <li>Automatic suspension on security breach attempts.</li>
                    </ul>
                </div>

                {/* Card 4: Decentralized Control */}
                <div className="bg-white p-8 rounded-2xl shadow-xl border-t-4 border-blue-500">
                    <div className="flex items-center mb-4">
                        <Server className="w-8 h-8 text-blue-600 mr-3" />
                        <h3 className="text-2xl font-bold text-gray-800">Encrypted Communication</h3>
                    </div>
                    <p className="text-gray-600 mb-4">
                        All communication between the scanner, the mobile app, and our servers is secured using modern TLS and end-to-end encryption protocols.
                    </p>
                    <ul className="list-disc list-inside text-gray-700 ml-4 space-y-1">
                        <li>AES-256 encryption standard.</li>
                        <li>Regular third-party security audits.</li>
                        <li>Privacy-by-Design implementation.</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
);

const RegistrationPage: React.FC<AuthPageProps> = ({ onSuccess, onNavigate }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [userType, setUserType] = useState<'client' | 'merchant'>('client');
    const [merchantName, setMerchantName] = useState('');
    const [irisHash, setIrisHash] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'capturing' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);

    const handleIrisCapture = useCallback(async (hash: string) => {
        setIrisHash(hash);
        if (!hash) {
            setStatus('idle');
            return;
        }

        // MOCK: Check if hash already exists (simulated uniqueness check)
        const isHashTaken = MOCK_USERS.some(u => u.irisHash === hash);
        if (isHashTaken) {
            setStatus('error');
            setError("Iris key already registered. Please login.");
            return;
        }

        // MOCK: Simulate registration API call
        setStatus('capturing');
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const newUser: User = {
                id: `client-${Date.now()}`,
                name,
                email,
                irisHash: hash,
                walletId: `w-${Date.now()}`,
                bankLinked: true,
                userType,
                ...(userType === 'merchant' && { merchantName }),
            };
            
            MOCK_USERS.push(newUser);
            setStatus('success');
            onSuccess(newUser);
        } catch (e) {
            setStatus('error');
            setError("Registration failed. Please try again.");
        }
    }, [name, email, userType, merchantName, onSuccess]);

    const isFormValid = name.length > 2 && email.includes('@') && (userType === 'client' || (userType === 'merchant' && merchantName.length > 2));

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 p-4 pt-24">
            <div className="w-full md:w-1/2 flex justify-center items-start pt-12 md:pt-24 order-2 md:order-1">
                <IrisCapture
                    onCapture={handleIrisCapture}
                    title="Iris Key Registration"
                    subtitle="Look at the camera to generate your unique biometric key."
                    status={status}
                    setStatus={setStatus}
                    errorMessage={error}
                    userNameForHash={name || 'NewUser'}
                />
            </div>
            <div className="w-full md:w-1/2 p-8 md:p-12 order-1 md:order-2">
                <div className="max-w-xl mx-auto bg-white p-8 rounded-xl shadow-2xl">
                    <h2 className="text-4xl font-bold text-gray-800 mb-6">Create Your Account</h2>
                    <p className="text-gray-500 mb-8">Set up your profile before generating your biometric key.</p>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                        <div className="flex space-x-4">
                            <button
                                onClick={() => setUserType('client')}
                                className={`flex-1 py-3 rounded-lg font-semibold transition ${userType === 'client' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                            >
                                <User className="inline w-5 h-5 mr-2" /> Client
                            </button>
                            <button
                                onClick={() => setUserType('merchant')}
                                className={`flex-1 py-3 rounded-lg font-semibold transition ${userType === 'merchant' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                            >
                                <Store className="inline w-5 h-5 mr-2" /> Merchant
                            </button>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Full Name</label>
                            <input 
                                type="text" id="name" value={name} onChange={(e) => setName(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="John Doe"
                                disabled={status === 'capturing' || status === 'success'}
                            />
                        </div>
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                            <input 
                                type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="you@example.com"
                                disabled={status === 'capturing' || status === 'success'}
                            />
                        </div>

                        {userType === 'merchant' && (
                            <div>
                                <label htmlFor="merchantName" className="block text-sm font-medium text-gray-700">Business/Merchant Name</label>
                                <input 
                                    type="text" id="merchantName" value={merchantName} onChange={(e) => setMerchantName(e.target.value)}
                                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="The Coffee Shop"
                                    disabled={status === 'capturing' || status === 'success'}
                                />
                            </div>
                        )}
                    </div>
                    
                    <button 
                        onClick={() => {
                            if (!isFormValid) {
                                setError("Please complete the form first.");
                                setStatus('error');
                                return;
                            }
                            // Form is ready, allows user to move to IrisCapture step (which is on the side)
                            setStatus('idle'); 
                            setError(null);
                        }}
                        disabled={!isFormValid || status === 'success'}
                        className={`mt-6 w-full py-3 rounded-lg font-semibold transition shadow-md
                            ${isFormValid && status !== 'success' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`
                        }
                    >
                        {status === 'success' ? 'Registration Complete!' : 'Confirm Details & Start Scan'}
                    </button>
                    
                    <p className="mt-6 text-center text-sm text-gray-500">
                        Already have an account? 
                        <button onClick={() => onNavigate('login')} className="text-blue-600 hover:text-blue-700 font-medium ml-1">
                            Log In
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

const LoginPage: React.FC<AuthPageProps> = ({ onSuccess, onNavigate }) => {
    const [irisHash, setIrisHash] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'capturing' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);

    const handleIrisCapture = useCallback(async (hash: string) => {
        setIrisHash(hash);
        if (!hash) {
            setStatus('idle');
            return;
        }

        // MOCK: Simulate login API call
        setStatus('capturing');
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const foundUser = MOCK_USERS.find(u => u.irisHash === hash);
            
            if (foundUser) {
                setStatus('success');
                onSuccess(foundUser);
            } else {
                setStatus('error');
                setError("No matching biometric key found. Please register or try again.");
            }
        } catch (e) {
            setStatus('error');
            setError("Login failed. Service unavailable.");
        }
    }, [onSuccess]);

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 pt-24">
            <IrisCapture
                onCapture={handleIrisCapture}
                title="Iris Key Login"
                subtitle="Look at the camera to verify your identity and log in."
                status={status}
                setStatus={setStatus}
                errorMessage={error}
                userNameForHash={'LoginAttempt'}
            />
            <p className="absolute bottom-10 text-center text-sm text-gray-500">
                Don't have an account? 
                <button onClick={() => onNavigate('register')} className="text-blue-600 hover:text-blue-700 font-medium ml-1">
                    Register Now
                </button>
            </p>
        </div>
    );
};

const ClientDashboard: React.FC<ClientDashboardProps> = ({ user, walletBalance, transactions, requests, onViewReceipt, onNavigate, setError }) => {
    
    // MOCK: Simple function to simulate funding the wallet
    const handleFundWallet = useCallback(async () => {
        setError(null);
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            MOCK_WALLET_BALANCE += 100; // Mock addition
            alert("Wallet funded with $100 (Mock)."); // Using alert as a placeholder for a non-modal feedback for mock
        } catch (e) {
            setError("Funding failed (Mock API Error).");
        }
    }, [setError]);

    return (
        <div className="min-h-screen bg-gray-50 pt-24 px-4 pb-12">
            <div className="max-w-6xl mx-auto">
                <h2 className="text-4xl font-bold text-gray-900 mb-6">Welcome back, {user.name}!</h2>
                
                {/* Metrics & Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    
                    {/* Wallet Balance */}
                    <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-blue-500">
                        <div className="flex justify-between items-center">
                            <p className="text-sm font-medium text-gray-500">Wallet Balance</p>
                            <Wallet className="w-5 h-5 text-blue-500" />
                        </div>
                        <p className="text-3xl font-extrabold text-gray-900 mt-1">${walletBalance.toFixed(2)}</p>
                        <button 
                            onClick={handleFundWallet}
                            className="text-blue-500 text-sm font-semibold mt-3 flex items-center hover:text-blue-700 transition"
                        >
                            <CreditCard className="w-4 h-4 mr-1" /> Fund Wallet (Mock +$100)
                        </button>
                    </div>

                    {/* Quick Action: Scan to Pay */}
                    <button 
                        onClick={() => onNavigate('scanner')}
                        className="bg-blue-600 text-white p-6 rounded-xl shadow-lg hover:bg-blue-700 transition transform hover:scale-[1.02] active:scale-[0.98] flex flex-col items-start justify-between"
                    >
                        <Scan className="w-6 h-6 mb-2" />
                        <span className="text-xl font-semibold text-left">Scan & Pay Now</span>
                        <span className="text-sm opacity-90 text-left">The fastest way to checkout.</span>
                    </button>

                    {/* Transaction Count */}
                    <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-green-500">
                        <div className="flex justify-between items-center">
                            <p className="text-sm font-medium text-gray-500">Completed Transactions</p>
                            <Receipt className="w-5 h-5 text-green-500" />
                        </div>
                        <p className="text-3xl font-extrabold text-gray-900 mt-1">{transactions.filter(t => t.status === 'completed').length}</p>
                        <p className="text-sm text-gray-500 mt-3">View your full history below.</p>
                    </div>
                </div>

                {/* Transaction History */}
                <div className="bg-white p-6 rounded-xl shadow-2xl">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">Transaction History</h3>
                    
                    {transactions.length === 0 ? (
                        <p className="text-gray-500 p-4 text-center">No transactions found.</p>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {[...transactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(tx => (
                                <li key={tx.id} className="py-4 flex justify-between items-center hover:bg-gray-50 transition duration-150 rounded-lg px-2 cursor-pointer" onClick={() => onViewReceipt(tx, 'client-dashboard')}>
                                    <div className="flex items-center">
                                        <div className="p-2 rounded-full bg-blue-100 mr-4">
                                            <Store className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-medium text-gray-900">{tx.merchantName || 'Unknown Merchant'}</p>
                                            <p className="text-sm text-gray-500 flex items-center"><Clock className="w-3 h-3 mr-1" /> {new Date(tx.timestamp).toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-semibold text-red-600">-${tx.amount.toFixed(2)}</p>
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tx.status === 'completed' ? 'bg-green-100 text-green-800' : tx.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                            {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

const MerchantDashboard: React.FC<MerchantDashboardProps> = ({ user, transactions, requests, onViewReceipt, onCreateRequest, onNavigate, setError }) => {
    const [amount, setAmount] = useState<number | ''>('');
    const [currency, setCurrency] = useState<string>('USD');
    const [loading, setLoading] = useState(false);
    const [lastRequest, setLastRequest] = useState<PaymentRequest | null>(null);

    const handleCreateRequest = useCallback(async () => {
        if (!amount || amount <= 0) {
            setError("Please enter a valid amount.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await onCreateRequest(amount as number, currency);
            // Mock the last request for display purposes
            setLastRequest({
                id: `req-${Date.now()}`,
                merchantId: user.id,
                merchantName: user.merchantName || 'Merchant',
                amount: amount as number,
                currency,
                status: 'pending',
                timestamp: new Date().toISOString(),
            });
            setAmount('');
        } catch (e) {
            setError("Failed to create payment request.");
        } finally {
            setLoading(false);
        }
    }, [amount, currency, onCreateRequest, user.id, user.merchantName, setError]);

    const completedTransactions = transactions.filter(t => t.status === 'completed');
    const totalRevenue = completedTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    return (
        <div className="min-h-screen bg-gray-50 pt-24 px-4 pb-12">
            <div className="max-w-6xl mx-auto">
                <h2 className="text-4xl font-bold text-gray-900 mb-6">Welcome, {user.merchantName}!</h2>
                
                {/* Metrics & New Request */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
                    
                    {/* Revenue Metric */}
                    <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-green-500">
                        <div className="flex justify-between items-center">
                            <p className="text-sm font-medium text-gray-500">Total Revenue (Mock)</p>
                            <DollarSign className="w-5 h-5 text-green-500" />
                        </div>
                        <p className="text-3xl font-extrabold text-gray-900 mt-1">${totalRevenue.toFixed(2)}</p>
                        <p className="text-sm text-gray-500 mt-3">From {completedTransactions.length} transactions.</p>
                    </div>
                    
                    {/* Request Metric */}
                    <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-yellow-500">
                        <div className="flex justify-between items-center">
                            <p className="text-sm font-medium text-gray-500">Pending Requests (Mock)</p>
                            <Clock className="w-5 h-5 text-yellow-500" />
                        </div>
                        <p className="text-3xl font-extrabold text-gray-900 mt-1">{requests.filter(r => r.status === 'pending').length}</p>
                        <p className="text-sm text-gray-500 mt-3">Awaiting client action.</p>
                    </div>

                    {/* Create Payment Request */}
                    <div className="bg-blue-600 text-white p-6 rounded-xl shadow-lg flex flex-col justify-between">
                        <h3 className="text-xl font-semibold mb-3">New Payment Request</h3>
                        <div className="flex space-x-2 mb-3">
                            <input 
                                type="number" 
                                value={amount}
                                onChange={(e) => setAmount(parseFloat(e.target.value) || '')}
                                placeholder="Amount"
                                min="0.01"
                                step="0.01"
                                className="w-full p-2 rounded-lg text-gray-900 font-medium"
                            />
                            <select 
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                className="p-2 rounded-lg text-gray-900 font-medium"
                            >
                                <option>USD</option>
                                <option>EUR</option>
                            </select>
                        </div>
                        <button 
                            onClick={handleCreateRequest}
                            disabled={loading || !amount || amount <= 0}
                            className="w-full bg-white text-blue-600 font-bold py-2 rounded-lg hover:bg-blue-100 transition disabled:bg-gray-300 disabled:text-gray-500"
                        >
                            {loading ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : "Generate QR Code"}
                        </button>
                    </div>
                </div>

                {/* Last Request / Transaction Feed */}
                <div className="grid lg:grid-cols-2 gap-6">
                    {/* Last Payment Request Card */}
                    <div className="bg-white p-6 rounded-xl shadow-2xl h-fit">
                        <h3 className="text-2xl font-bold text-gray-800 mb-4">Latest Request</h3>
                        {lastRequest ? (
                            <div className="border border-blue-200 p-4 rounded-lg bg-blue-50">
                                <p className="text-4xl font-extrabold text-blue-700 mb-2">${lastRequest.amount.toFixed(2)}</p>
                                <p className="text-gray-700 flex items-center mb-1"><Clock className="w-4 h-4 mr-2" /> Status: <span className="font-semibold ml-1 text-yellow-700">{lastRequest.status.toUpperCase()}</span></p>
                                <p className="text-sm text-gray-500">ID: {lastRequest.id}</p>
                                <div className="mt-4 bg-gray-900 p-6 rounded-lg text-white flex justify-center items-center">
                                    <Scan className="w-12 h-12 text-green-400" />
                                    <span className="ml-4 text-lg font-semibold">QR Code Mock Display</span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-500 p-4 text-center">Generate a new payment request above.</p>
                        )}
                    </div>

                    {/* Transaction History */}
                    <div className="bg-white p-6 rounded-xl shadow-2xl">
                        <h3 className="text-2xl font-bold text-gray-800 mb-4">Recent Sales</h3>
                        {completedTransactions.length === 0 ? (
                            <p className="text-gray-500 p-4 text-center">No sales completed yet.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {[...completedTransactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5).map(tx => (
                                    <li key={tx.id} className="py-3 flex justify-between items-center hover:bg-gray-50 transition duration-150 rounded-lg px-2 cursor-pointer" onClick={() => onViewReceipt(tx, 'merchant-dashboard')}>
                                        <div className="flex items-center">
                                            <div className="p-1 rounded-full bg-green-100 mr-3">
                                                <User className="w-4 h-4 text-green-600" />
                                            </div>
                                            <div>
                                                <p className="text-md font-medium text-gray-900">{tx.clientName || 'Anonymous Client'}</p>
                                                <p className="text-xs text-gray-500">{new Date(tx.timestamp).toLocaleTimeString()}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-semibold text-green-600">+${tx.amount.toFixed(2)}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ScannerPage: React.FC<ScannerPageProps> = ({ user, onPaymentSuccess, setError, registeredUsers }) => {
    const [irisHash, setIrisHash] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'capturing' | 'success' | 'error'>('idle');
    const [merchantId, setMerchantId] = useState<string | null>(null);
    const [amount, setAmount] = useState<number | null>(null);
    const [merchantName, setMerchantName] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // MOCK: Simulate QR Code Scan (Sets the payment details)
    const handleMockScan = useCallback((mockId: string) => {
        setErrorMessage(null);
        // Find a mock merchant by ID
        const merchant = registeredUsers.find(u => u.id === mockId && u.userType === 'merchant');
        if (!merchant) {
            setErrorMessage("Invalid QR code or merchant ID.");
            setStatus('error');
            return;
        }

        // Simulate random payment request from the merchant
        const mockAmount = Math.floor(Math.random() * 90) + 10; // $10 to $100
        setMerchantId(merchant.id);
        setMerchantName(merchant.merchantName || 'Mock Merchant');
        setAmount(mockAmount);
        setStatus('idle'); // Ready for iris scan
    }, [registeredUsers]);

    // MOCK: Simulate Iris Scan Verification and Payment Execution
    const handleIrisCapture = useCallback(async (hash: string) => {
        setIrisHash(hash);
        if (!hash) {
            setStatus('idle'); // Reset
            return;
        }
        
        if (!user) {
            setErrorMessage("User not logged in.");
            setStatus('error');
            return;
        }
        
        if (!merchantId || amount === null) {
            setErrorMessage("Payment details missing. Please scan QR first.");
            setStatus('error');
            return;
        }

        if (user.irisHash !== hash) {
            setErrorMessage("Iris verification failed. Hash mismatch.");
            setStatus('error');
            return;
        }
        
        // Final verification check
        setStatus('capturing');
        setErrorMessage(null);

        try {
            await new Promise(resolve => setTimeout(resolve, 1500)); // Processing time
            
            // MOCK: Perform transaction logic
            if (MOCK_WALLET_BALANCE < amount) {
                setStatus('error');
                setErrorMessage(`Transaction failed: Insufficient funds. Balance: $${MOCK_WALLET_BALANCE.toFixed(2)}`);
                return;
            }

            MOCK_WALLET_BALANCE -= amount; // Deduct funds
            
            const newTx: Transaction = {
                id: `tx-${Date.now()}`,
                amount,
                currency: 'USD',
                status: 'completed',
                timestamp: new Date().toISOString(),
                merchantId: merchantId,
                merchantName: merchantName || 'Merchant',
                clientId: user.id,
                clientName: user.name,
            };

            MOCK_TRANSACTIONS.push(newTx);
            
            setStatus('success');
            onPaymentSuccess(newTx);
        } catch (e) {
            setStatus('error');
            setErrorMessage("Transaction failed due to an unknown error.");
            setError("Transaction failed due to an unknown error.");
        }
    }, [user, merchantId, amount, merchantName, onPaymentSuccess, setError]);
    
    // Determine the step
    const isScanned = merchantId !== null && amount !== null;
    const scannerTitle = isScanned ? `Pay ${merchantName}` : 'Step 2: Scan Your Iris';
    const scannerSubtitle = isScanned ? `Confirm payment of $${amount!.toFixed(2)}` : 'Scan QR code first.';
    const captureDisabled = !isScanned;

    // Mock QR Code buttons
    const merchantMocks = registeredUsers.filter(u => u.userType === 'merchant');

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 pt-24">
            <h2 className="text-4xl font-bold text-gray-800 mb-8">IrisPay Scanner Terminal</h2>
            
            <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8">
                
                {/* 1. Payment Details / QR Scan */}
                <div className="bg-white p-6 rounded-xl shadow-2xl h-fit border-t-4 border-green-500">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center"><Scan className="w-5 h-5 mr-2 text-green-600" /> Step 1: Scan QR Code</h3>
                    
                    {!isScanned ? (
                        <>
                            <p className="text-gray-600 mb-4">Select a mock merchant below to simulate scanning their payment QR code.</p>
                            <div className="space-y-3">
                                {merchantMocks.map(m => (
                                    <button 
                                        key={m.id}
                                        onClick={() => handleMockScan(m.id)}
                                        className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition flex items-center justify-center shadow-md"
                                    >
                                        <Smartphone className="w-5 h-5 mr-2" /> Mock Scan: {m.merchantName}
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="text-center p-6 bg-green-50 rounded-lg border border-green-200">
                            <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                            <p className="text-2xl font-bold text-gray-900">{merchantName}</p>
                            <p className="text-5xl font-extrabold text-green-700 my-3">${amount!.toFixed(2)}</p>
                            <p className="text-gray-600">Payment details confirmed. Proceed to biometric scan.</p>
                            <button onClick={() => setMerchantId(null)} className="text-sm text-gray-500 mt-3 hover:underline">Cancel Payment</button>
                        </div>
                    )}
                </div>

                {/* 2. Iris Capture */}
                <div className={`flex justify-center h-fit pt-0 ${captureDisabled ? 'opacity-50' : ''}`}>
                    <IrisCapture
                        onCapture={handleIrisCapture}
                        title={scannerTitle}
                        subtitle={scannerSubtitle}
                        status={status}
                        setStatus={setStatus}
                        errorMessage={errorMessage}
                        userNameForHash={user?.name || 'ClientPayment'}
                    />
                </div>
            </div>
            
        </div>
    );
};

const ReceiptPage: React.FC<ReceiptPageProps> = ({ tx, onBack }) => (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 pt-24">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-2xl border-t-8 border-blue-600">
            <div className="flex justify-center mb-6">
                <CheckCircle className="w-12 h-12 text-blue-600" />
            </div>
            <h2 className="text-4xl font-bold text-center text-gray-900 mb-2">Payment Successful!</h2>
            <p className="text-center text-gray-500 mb-8">Thank you for using IrisPay.</p>

            <div className="space-y-3 border-y border-gray-200 py-6 mb-6">
                <div className="flex justify-between text-lg font-medium text-gray-800">
                    <span>Merchant</span>
                    <span className="font-semibold">{tx.merchantName}</span>
                </div>
                <div className="flex justify-between text-lg font-medium text-gray-800">
                    <span>Client</span>
                    <span className="font-semibold">{tx.clientName}</span>
                </div>
                <div className="flex justify-between text-lg font-medium text-gray-800">
                    <span>Date & Time</span>
                    <span>{new Date(tx.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-lg font-medium text-gray-800">
                    <span>Transaction ID</span>
                    <span className="text-sm">{tx.id}</span>
                </div>
            </div>

            <div className="flex justify-between items-center mb-8">
                <span className="text-xl font-bold text-gray-700">Total Paid</span>
                <span className="text-5xl font-extrabold text-green-600">-${tx.amount.toFixed(2)}</span>
            </div>

            <button 
                onClick={onBack}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition shadow-md"
            >
                <ArrowRight className="inline w-5 h-5 mr-2 transform rotate-180" /> Back to Dashboard
            </button>
        </div>
    </div>
);


// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [user, setUser] = useState<User | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(MOCK_WALLET_BALANCE);
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
  const [requests, setRequests] = useState<PaymentRequest[]>([]); // Mock: Merchant requests
  const [error, setError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Transaction | null>(null);
  const [dashboardBackPage, setDashboardBackPage] = useState<'client-dashboard' | 'merchant-dashboard'>('client-dashboard');

  // Sync MOCK_WALLET_BALANCE to state periodically (for simplicity in mock)
  useEffect(() => {
    const interval = setInterval(() => {
        if (walletBalance !== MOCK_WALLET_BALANCE) {
            setWalletBalance(MOCK_WALLET_BALANCE);
        }
        if (transactions.length !== MOCK_TRANSACTIONS.length) {
             setTransactions([...MOCK_TRANSACTIONS]);
        }
    }, 500);
    return () => clearInterval(interval);
  }, [walletBalance, transactions.length]);


  // Handlers
  const handleLoginSuccess = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
    setCurrentPage(loggedInUser.userType === 'client' ? 'client-dashboard' : 'merchant-dashboard');
    setError(null);
  }, []);

  const handleRegistrationSuccess = useCallback((newUser: User) => {
    setUser(newUser);
    setCurrentPage(newUser.userType === 'client' ? 'client-dashboard' : 'merchant-dashboard');
    setError(null);
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    setCurrentPage('landing');
    setError(null);
  }, []);

  const handlePaymentSuccess = useCallback((tx: Transaction) => {
      // Update local state directly with new transaction (already updated in MOCK_TRANSACTIONS in scanner)
      // MOCK_WALLET_BALANCE is updated in the ScannerPage, but we update the state here for UI sync
      setWalletBalance(MOCK_WALLET_BALANCE);
      
      // Update the transaction list
      setTransactions([...MOCK_TRANSACTIONS]);
      
      // Display the receipt
      setSelectedReceipt(tx);
      setCurrentPage('receipt');
      setDashboardBackPage('client-dashboard');
  }, []);

  const handleMerchantRequest = useCallback(async (amount: number, currency: string) => {
      // MOCK: Simulate creating a payment request
      const newRequest: PaymentRequest = {
          id: `req-${Date.now()}`,
          merchantId: user!.id,
          merchantName: user!.merchantName || 'Merchant',
          amount,
          currency,
          status: 'pending',
          timestamp: new Date().toISOString(),
      };
      setRequests(prev => [...prev, newRequest]);
      return new Promise<void>(resolve => setTimeout(resolve, 500));
  }, [user]);

  const handleViewReceipt = useCallback((tx: Transaction, backPage: 'client-dashboard' | 'merchant-dashboard') => {
      setSelectedReceipt(tx);
      setDashboardBackPage(backPage);
      setCurrentPage('receipt');
  }, []);

  // Props bundles for dashboards
  const registeredUsers = MOCK_USERS.map(u => ({ 
      id: u.id, 
      name: u.name, 
      userType: u.userType, 
      merchantName: u.merchantName 
  }));

  const sharedDashboardProps: SharedDashboardProps = {
    user: user!,
    transactions: transactions.filter(tx => user && (tx.clientId === user.id || tx.merchantId === user.id)),
    requests,
    onViewReceipt: handleViewReceipt,
    setError: setError,
  };

  const clientDashboardProps: ClientDashboardProps = {
    ...sharedDashboardProps,
    walletBalance: walletBalance,
    onNavigate: setCurrentPage,
  };

  const merchantDashboardProps: MerchantDashboardProps = {
    ...sharedDashboardProps,
    onCreateRequest: handleMerchantRequest,
    onNavigate: setCurrentPage,
  };

  // Render Functions
  const NavBar: React.FC = () => (
    <nav className="fixed top-0 left-0 right-0 bg-gray-900 shadow-md z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center">
          <button 
            onClick={() => setCurrentPage('landing')}
            className="flex items-center text-white text-2xl font-bold tracking-tight hover:text-blue-400 transition"
          >
            <Eye className="w-6 h-6 mr-2 text-blue-500" /> IrisPay
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {[
            { page: 'features', label: 'Features', icon: <CreditCard className="w-4 h-4" /> },
            { page: 'workflow', label: 'Workflow', icon: <ArrowRight className="w-4 h-4" /> },
            { page: 'security', label: 'Security', icon: <Lock className="w-4 h-4" /> },
          ].map((item) => (
            <button
              key={item.page}
              onClick={() => setCurrentPage(item.page as Page)}
              className={`hidden md:flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 
                ${currentPage === item.page ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'}`
              }
            >
              {item.icon} <span className="ml-1">{item.label}</span>
            </button>
          ))}
          
          <button
            onClick={() => setCurrentPage('scanner')}
            className={`p-2 rounded-lg transition-all duration-200 
              ${currentPage === 'scanner' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'}`
            }
          >
            <Scan className="w-4 h-4" />
          </button>
          
          {user && (
            <button
              onClick={() => setCurrentPage(user.userType === 'client' ? 'client-dashboard' : 'merchant-dashboard')}
              className={`p-2 rounded-lg transition-all duration-200 
                ${(currentPage === 'client-dashboard' || currentPage === 'merchant-dashboard') ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'}`
              }
            >
              {user.userType === 'client' ? <User className="w-4 h-4" /> : <Store className="w-4 h-4" />}
            </button>
          )}

          {user ? (
            <button
              onClick={handleLogout}
              className="p-2 ml-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                onClick={() => setCurrentPage('login')}
                className={`p-2 ml-2 rounded-lg transition-all duration-200 bg-green-600 text-white hover:bg-green-700`}
                title="Log In"
              >
                <User className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );

  // Render current page
  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'features':
        return <FeaturesPage />;
      case 'workflow':
        return <WorkflowPage />;
      case 'security':
        return <SecurityPage />;
      case 'scanner':
        return (
          <ScannerPage 
            user={user} 
            onPaymentSuccess={handlePaymentSuccess} 
            setError={setError} 
            onNavigate={setCurrentPage} 
            registeredUsers={registeredUsers}
          />
        );
      case 'register':
        return <RegistrationPage onSuccess={handleRegistrationSuccess} onNavigate={setCurrentPage} />;
      case 'login':
        return <LoginPage onSuccess={handleLoginSuccess} onNavigate={setCurrentPage} />;
      case 'client-dashboard':
        // The ternary operator ensures props are only spread if user is not null
        return user && user.userType === 'client' ? (
          <ClientDashboard {...clientDashboardProps} />
        ) : <LandingPage onNavigate={setCurrentPage} />;
      case 'merchant-dashboard':
        return user && user.userType === 'merchant' ? (
           <MerchantDashboard {...merchantDashboardProps} />
        ) : <LandingPage onNavigate={setCurrentPage} />;
      case 'receipt':
        return selectedReceipt ? <ReceiptPage tx={selectedReceipt} onBack={() => setCurrentPage(dashboardBackPage)} /> : <LandingPage onNavigate={setCurrentPage} />;
      default:
        return <LandingPage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="relative font-sans antialiased min-h-screen">
      <NavBar />
      <main>
        {renderCurrentPage()}
      </main>

      {/* Basic Error Modal */}
      {error && (
        <Modal 
            title="Application Error"
            message={error}
            onClose={() => setError(null)}
            icon={<AlertCircle className="w-8 h-8" />}
            color="red"
        />
      )}
    </div>
  );
}

export default App;
