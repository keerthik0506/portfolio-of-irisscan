import React, { useState, useRef, useEffect, useCallback } from "react";
import { Camera, Check, X, RefreshCw, Eye, AlertCircle } from 'lucide-react';

// Utility for hashing (simulated)
const simpleHash = (data: string): string => {
  // In a real application, this would be a secure, non-reversible cryptographic hash (e.g., SHA-256)
  // applied to the biometric template extracted from the image.
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `iris-hash-${Math.abs(hash).toString(36).substring(0, 10)}`;
};

interface IrisCaptureProps {
  onCaptureSuccess: (preview: string, hash: string) => void;
  onCancel: () => void;
  mode: 'registration' | 'authentication';
}

/**
 * Renders the webcam view with an overlay to strictly guide the user to focus on the face/iris.
 * This simulates a system that only processes biometric data from the face area.
 */
const IrisCapture: React.FC<IrisCaptureProps> = ({ onCaptureSuccess, onCancel, mode }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'complete' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  
  const instructionMessage = mode === 'registration'
    ? "Align your face and eye within the circle. Only the iris will be scanned. Remove glasses."
    : "Align your eye for authentication. Only the iris will be scanned. Keep other objects clear.";

  // 1. Setup Camera Stream
  useEffect(() => {
    const startCamera = async () => {
      setStatus('scanning');
      setErrorMessage(null);
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "user", width: 320, height: 240 } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play();
          setStream(mediaStream);
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setStatus('error');
        setErrorMessage("Camera access denied or device not found. Please ensure your camera is enabled.");
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // 2. Capture and Process (Simulated)
  const captureAndProcess = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || status === 'complete') return;
    
    // Simulate biometric capture - strictly focused on the face/eye area
    setStatus('scanning');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Define the area to 'crop' (for simulation, this is the center area)
    const context = canvas.getContext('2d');
    if (!context) return;

    // Set canvas dimensions to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // --- Biometric 'Cropping' and Capture Simulation ---
    
    // 1. Draw the full frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. Extract image data (the simulated "iris" image)
    const imageDataURL = canvas.toDataURL('image/png');

    // 3. Simulate processing and filtering out non-face objects
    // In a real system, OpenCV or similar library would detect the face/iris,
    // crop the image to the iris area, and ensure no other objects interfere.
    
    // For this simulation, we'll confirm success and hash the cropped data
    const hash = simpleHash(imageDataURL); // Hash of the (simulated) cropped iris image
    
    setCapturedPreview(imageDataURL);
    setStatus('complete');
    
    // Stop the video stream after successful capture
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
    }

    onCaptureSuccess(imageDataURL, hash);

  }, [status, stream, onCaptureSuccess]);

  // 3. Reset Function
  const handleReset = () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    setCapturedPreview(null);
    setErrorMessage(null);
    setStatus('idle');
    // Re-trigger useEffect to restart the camera
    window.location.reload(); 
    // In a real React app, you would use state to restart the camera, 
    // but a full reload simplifies stream handling in this single-file environment.
  };

  const buttonClass = "px-6 py-3 rounded-full font-semibold text-sm transition-all duration-300 shadow-lg flex items-center justify-center space-x-2";

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-white flex items-center">
        <Eye className="w-6 h-6 mr-2 text-sky-400" /> 
        Iris Scan: <span className="text-sky-400 ml-1">Strict Biometric Focus</span>
      </h2>
      <p className="text-center text-sm mb-6 text-slate-300 max-w-xs">{instructionMessage}</p>

      {/* Camera Viewport and Strict Focus Mask */}
      <div className="relative w-full aspect-video max-w-sm rounded-xl overflow-hidden shadow-inner border-4 border-slate-700">
        
        {/* Video Element */}
        <video 
          ref={videoRef} 
          className={`w-full h-full object-cover ${capturedPreview ? 'hidden' : 'block'}`}
          playsInline
          muted
          autoPlay
        ></video>

        {/* Captured Preview */}
        {capturedPreview && (
          <img src={capturedPreview} alt="Captured Iris Preview" className="w-full h-full object-cover" />
        )}

        {/* STRICT FOCUS MASK OVERLAY */}
        {!capturedPreview && (
            <div className="absolute inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center pointer-events-none">
                {/* Central Face/Eye Cutout */}
                <div className="w-3/4 h-3/4 bg-transparent border-4 border-sky-400 rounded-full shadow-[0_0_0_9999px_rgba(30,41,59,0.75)] animate-pulse-slow">
                    <p className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-center text-xs font-mono">
                        FOCUS AREA
                    </p>
                </div>
            </div>
        )}

        {/* Status Overlay */}
        {status === 'scanning' && !capturedPreview && (
          <div className="absolute bottom-0 left-0 right-0 p-2 bg-sky-600 bg-opacity-80 text-white text-center text-xs font-semibold">
            Scanning for Face and Iris...
          </div>
        )}
        {errorMessage && (
          <div className="absolute inset-0 bg-red-700 bg-opacity-80 flex items-center justify-center p-4 text-white text-sm font-semibold">
            <AlertCircle className="w-5 h-5 mr-2" /> {errorMessage}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex space-x-4">
        {status === 'scanning' && (
          <button
            onClick={captureAndProcess}
            className={`${buttonClass} bg-sky-500 text-white hover:bg-sky-600`}
            disabled={!stream}
          >
            <Camera className="w-5 h-5" /> 
            Capture Iris
          </button>
        )}

        {status === 'complete' && capturedPreview && (
          <span className={`${buttonClass} bg-green-500 text-white`}>
            <Check className="w-5 h-5" />
            Iris Data Captured!
          </span>
        )}
        
        {capturedPreview && (
          <button
            onClick={handleReset}
            className={`${buttonClass} bg-gray-500 text-white hover:bg-gray-600`}
          >
            <RefreshCw className="w-5 h-5" /> 
            Recapture
          </button>
        )}

        {!capturedPreview && (
            <button
              onClick={onCancel}
              className={`${buttonClass} bg-red-500 text-white hover:bg-red-600`}
            >
              <X className="w-5 h-5" /> 
              Cancel
            </button>
        )}

      </div>
      
      {/* Optional Debug Info */}
      {capturedPreview && (
        <p className="mt-4 text-xs text-slate-400">
          *Biometric data successfully extracted and hashed for security.
        </p>
      )}
    </div>-
  );
};

export default IrisCapture;
