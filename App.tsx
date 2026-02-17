
import React, { useState, useEffect, useCallback, useRef } from 'react';
import RegistrationForm from './components/RegistrationForm';
import { UserProfile, AppState, EmergencyContacts, AlertMessages, TriggerReason } from './types';
import { generateEmergencyMessages } from './services/geminiService';

const EMERGENCY_CONTACTS: EmergencyContacts = {
  ambulance: '911' 
};

const DEFAULT_G_THRESHOLD = 3.5;
const COUNTDOWN_TIME = 10; 
const MOVEMENT_THRESHOLD_METERS = 60.96; 
const MINIMUM_SPEED_THRESHOLD = 15 / 3.6; // Reduced to 15km/h for sensitivity
const VEHICLE_MASS_KG = 1500;
const IMPACT_DURATION_SEC = 0.1;

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.REGISTRATION);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [forces, setForces] = useState({ x: 0, y: 0, z: 0, total: 0, g: 0 });
  const [gThreshold, setGThreshold] = useState(DEFAULT_G_THRESHOLD);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [countdown, setCountdown] = useState(COUNTDOWN_TIME);
  const [alertLogs, setAlertLogs] = useState<AlertMessages | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [startLocation, setStartLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [triggerReason, setTriggerReason] = useState<TriggerReason>(TriggerReason.IMPACT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const [confirmationStatus, setConfirmationStatus] = useState({
    ambulanceAcknowledged: false,
    familyAcknowledged: false
  });

  const countdownIntervalRef = useRef<number | null>(null);
  const autoTriggeredRef = useRef<boolean>(false);

  const triggerNativeSms = useCallback((phone: string, message: string) => {
    if (!phone || !message) return;
    const encodedMsg = encodeURIComponent(message);
    const smsUrl = `sms:${phone}?body=${encodedMsg}`;
    window.location.href = smsUrl;
  }, []);

  // AUTO DISPATCH LOGIC: Prioritize Family as requested "SMS SHOULD SEND AUTO AUTO MATICALLY TO FAMILY"
  useEffect(() => {
    if (appState === AppState.ALERT_SENT && alertLogs && !autoTriggeredRef.current && !isGenerating) {
      autoTriggeredRef.current = true;
      
      // Auto-trigger Family SMS first (as per latest prompt emphasis)
      if (user?.emergencyContact) {
        triggerNativeSms(user.emergencyContact, alertLogs.family);
      }
      
      console.log("CRITICAL: Automatic SMS Dispatch Protocol initiated for Family.");
    }
  }, [appState, alertLogs, triggerNativeSms, isGenerating, user]);

  const updateLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const speed = pos.coords.speed || 0;
          setLocation(newLoc);
          setCurrentSpeed(speed);
          
          if (appState === AppState.MONITORING && startLocation) {
            const R = 6371e3;
            const φ1 = startLocation.lat * Math.PI/180;
            const φ2 = newLoc.lat * Math.PI/180;
            const Δφ = (newLoc.lat-startLocation.lat) * Math.PI/180;
            const Δλ = (newLoc.lng-startLocation.lng) * Math.PI/180;
            const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                      Math.cos(φ1) * Math.cos(φ2) *
                      Math.sin(Δλ/2) * Math.sin(Δλ/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c;

            if (distance > MOVEMENT_THRESHOLD_METERS) {
              triggerAlert(TriggerReason.MOVEMENT);
            }
          }
        },
        (err) => console.error("Location error", err),
        { enableHighAccuracy: true }
      );
    }
  }, [appState, startLocation]);

  useEffect(() => {
    const interval = setInterval(updateLocation, 2000);
    return () => clearInterval(interval);
  }, [updateLocation]);

  useEffect(() => {
    if (appState !== AppState.MONITORING) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const x = acc.x || 0;
      const y = acc.y || 0;
      const z = acc.z || 0;
      const total = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
      const g = total / 9.81;
      
      setForces({ x, y, z, total, g });

      // TRIGGER: If current G-Force exceeds the customizable threshold
      if (g > gThreshold && currentSpeed >= MINIMUM_SPEED_THRESHOLD) {
        triggerAlert(TriggerReason.IMPACT);
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [appState, currentSpeed, gThreshold]);

  const triggerAlert = (reason: TriggerReason) => {
    if (appState === AppState.ALERT_COUNTDOWN || appState === AppState.ALERT_SENT || appState === AppState.CONFIRMATION) return;
    setTriggerReason(reason);
    setAppState(AppState.ALERT_COUNTDOWN);
    setCountdown(COUNTDOWN_TIME);
    autoTriggeredRef.current = false;
    
    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          sendAlerts(reason);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const sendAlerts = async (reason: TriggerReason) => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (!user) return;
    
    setIsGenerating(true);
    setAppState(AppState.ALERT_SENT);
    
    const kineticData = {
      x: forces.x / 9.81,
      y: forces.y / 9.81,
      g: forces.g
    };

    const messages = await generateEmergencyMessages(user, location, EMERGENCY_CONTACTS, reason, kineticData);
    setAlertLogs(messages);
    setIsGenerating(false);
  };

  const cancelAlert = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setAppState(AppState.MONITORING);
    if (location) setStartLocation(location);
  };

  const onRegister = (userData: UserProfile) => {
    setUser(userData);
    setAppState(AppState.MONITORING);
    if (location) setStartLocation(location);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12 font-sans overflow-hidden">
      <nav className="bg-blue-700 text-white shadow-lg p-4 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <i className="fa-solid fa-truck-medical text-2xl"></i>
            <span className="text-xl font-black tracking-tight uppercase">LifeGuard</span>
          </div>
          <div className="flex items-center space-x-4">
            {user && appState === AppState.MONITORING && (
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 hover:bg-blue-600 rounded-full transition"
              >
                <i className={`fa-solid fa-cog text-xl ${showSettings ? 'rotate-90' : ''} transition-transform`}></i>
              </button>
            )}
            {user && (
              <div className="text-xs text-blue-100 flex flex-col items-end">
                <span className="flex items-center">
                  <span className="h-1.5 w-1.5 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                  Surveillance Active
                </span>
                <span className="font-bold">{user.name}</span>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto p-4 pt-8">
        {appState === AppState.REGISTRATION && (
          <RegistrationForm onRegister={onRegister} />
        )}

        {appState === AppState.MONITORING && (
          <div className="space-y-6">
            {showSettings && (
              <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-blue-50 animate-in slide-in-from-top duration-300">
                <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest mb-4">G-Force Sensitivity Settings</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-gray-500 mb-2">
                      <span>Threshold: {gThreshold.toFixed(1)}G</span>
                      <span>Safe: 1.0G - 8.0G</span>
                    </div>
                    <input 
                      type="range" 
                      min="1.0" 
                      max="8.0" 
                      step="0.1" 
                      value={gThreshold}
                      onChange={(e) => setGThreshold(parseFloat(e.target.value))}
                      className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <p className="text-[10px] text-gray-400 mt-2 font-medium">Lowering this makes the system more sensitive to minor bumps.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white p-8 rounded-3xl shadow-xl border-t-8 border-blue-600 relative overflow-hidden">
              <div className="absolute top-4 right-4 text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full">
                Auto-Sms Armed
              </div>
              
              <div className="flex flex-col items-center justify-center space-y-6 mb-8 text-center">
                <div className="relative w-48 h-48">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle 
                      cx="96" cy="96" r="80" 
                      className="stroke-gray-100 fill-none" 
                      strokeWidth="12" 
                    />
                    <circle 
                      cx="96" cy="96" r="80" 
                      className="stroke-blue-600 fill-none transition-all duration-300" 
                      strokeWidth="12"
                      strokeDasharray={`${Math.min(forces.g / gThreshold, 1) * 502} 502`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-5xl font-black text-blue-800">{forces.g.toFixed(1)}</p>
                    <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">G-FORCE</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-8 w-full">
                   <div className="text-center">
                      <p className="text-[10px] font-black text-gray-400 uppercase">X-Axis</p>
                      <p className="text-xl font-mono font-bold text-gray-700">{(forces.x / 9.81).toFixed(2)}G</p>
                   </div>
                   <div className="text-center">
                      <p className="text-[10px] font-black text-gray-400 uppercase">Y-Axis</p>
                      <p className="text-xl font-mono font-bold text-gray-700">{(forces.y / 9.81).toFixed(2)}G</p>
                   </div>
                   <div className="text-center border-l-2 border-gray-50 pl-4">
                      <p className="text-[10px] font-black text-gray-400 uppercase">Velocity</p>
                      <p className="text-xl font-mono font-bold text-blue-600">{(currentSpeed * 3.6).toFixed(0)} <span className="text-[10px]">km/h</span></p>
                   </div>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={() => triggerAlert(TriggerReason.IMPACT)}
                  className="w-full bg-gray-900 text-white font-black py-4 rounded-xl shadow-lg transform active:scale-95 transition text-sm uppercase tracking-widest hover:bg-black"
                >
                  Manual Trigger (Impact Test)
                </button>
              </div>
            </div>
          </div>
        )}

        {appState === AppState.ALERT_COUNTDOWN && (
          <div className="fixed inset-0 bg-red-600 z-[100] flex flex-col items-center justify-center p-6 text-white text-center">
            <div className="mb-10 relative">
              <i className="fa-solid fa-circle-exclamation text-9xl animate-pulse"></i>
              <div className="absolute inset-0 bg-white/20 rounded-full blur-3xl animate-ping"></div>
            </div>
            <h1 className="text-5xl font-black mb-4 uppercase tracking-tighter">IMPACT DETECTED</h1>
            <p className="text-lg mb-12 max-w-sm font-bold opacity-80 uppercase tracking-widest leading-relaxed">
              Auto Dispatch to Family In:
            </p>
            <div className="text-9xl font-black mb-16 font-mono tracking-tighter">{countdown}</div>
            <button 
              onClick={cancelAlert}
              className="w-full max-w-sm bg-white text-red-600 font-black py-6 rounded-3xl text-2xl shadow-2xl hover:bg-gray-100 transition active:scale-95"
            >
              I AM SAFE - CANCEL
            </button>
          </div>
        )}

        {appState === AppState.ALERT_SENT && (
          <div className="bg-white p-10 rounded-3xl shadow-2xl border-4 border-red-50 max-w-2xl mx-auto text-center relative overflow-hidden">
            {isGenerating ? (
              <div className="py-20">
                <div className="relative inline-block mb-10">
                   <i className="fa-solid fa-microchip text-7xl text-blue-500 animate-pulse"></i>
                   <div className="absolute top-0 right-0 h-4 w-4 bg-red-500 rounded-full animate-ping"></div>
                </div>
                <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Analyzing Kinetic Data</h2>
                <p className="text-gray-500 mt-2 font-medium">Calculating X, Y, and G-force for SMS report...</p>
              </div>
            ) : (
              <>
                <div className="bg-red-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <i className="fa-solid fa-paper-plane text-red-600 text-4xl"></i>
                </div>
                <h2 className="text-4xl font-black text-gray-900 uppercase tracking-tighter">Deploying Alerts</h2>
                <p className="text-gray-500 mt-2 mb-10 font-medium">Automatic Dispatch triggered. SMS Interface opened for verification.</p>
                
                <div className="space-y-4 text-left">
                   <div className="bg-red-50 p-6 rounded-2xl border-2 border-red-100 shadow-sm relative">
                      <div className="absolute -top-3 left-4 bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest">Primary Auto-Dispatch</div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-black text-red-800 text-xs tracking-widest uppercase flex items-center">
                          <i className="fa-solid fa-house-chimney-medical mr-2"></i> Family SMS
                        </span>
                        <span className="text-xs font-bold text-red-400 bg-white px-3 py-1 rounded-full shadow-sm">{user?.emergencyContact}</span>
                      </div>
                      <div className="bg-white/80 p-4 rounded-xl text-sm font-medium text-red-900 italic border border-red-100">
                        "{alertLogs?.family}"
                      </div>
                      <button onClick={() => triggerNativeSms(user?.emergencyContact || '', alertLogs?.family || '')} className="mt-4 w-full bg-red-600 text-white font-black py-3 rounded-xl shadow-lg text-xs uppercase tracking-widest active:scale-95 transition">
                        Resend to Family
                      </button>
                   </div>

                   <div className="bg-blue-50 p-6 rounded-2xl border-2 border-blue-100 shadow-sm">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-black text-blue-800 text-xs tracking-widest uppercase flex items-center">
                          <i className="fa-solid fa-hospital mr-2"></i> Medical SMS
                        </span>
                        <span className="text-xs font-bold text-blue-400 bg-white px-3 py-1 rounded-full shadow-sm">{EMERGENCY_CONTACTS.ambulance}</span>
                      </div>
                      <div className="bg-white/80 p-4 rounded-xl text-sm font-medium text-blue-900 italic border border-blue-100">
                        "{alertLogs?.ambulance}"
                      </div>
                      <button onClick={() => triggerNativeSms(EMERGENCY_CONTACTS.ambulance, alertLogs?.ambulance || '')} className="mt-4 w-full bg-blue-600 text-white font-black py-3 rounded-xl shadow-lg text-xs uppercase tracking-widest active:scale-95 transition">
                        Send to Ambulance
                      </button>
                   </div>
                </div>

                <button 
                  onClick={() => setAppState(AppState.CONFIRMATION)}
                  className="mt-12 w-full bg-gray-900 text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest text-lg"
                >
                  Verify Responses <i className="fa-solid fa-chevron-right ml-2"></i>
                </button>
              </>
            )}
          </div>
        )}

        {appState === AppState.CONFIRMATION && (
          <div className="bg-white p-10 rounded-3xl shadow-2xl border-4 border-green-100 max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <div className="bg-green-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className="fa-solid fa-check-double text-green-600 text-4xl"></i>
              </div>
              <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Incident Response</h2>
              <p className="text-sm text-gray-500 mt-1 font-medium">Verify reception of auto-dispatched messages.</p>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => setConfirmationStatus(prev => ({ ...prev, familyAcknowledged: !prev.familyAcknowledged }))}
                className={`w-full flex items-center justify-between p-7 rounded-2xl border-2 transition-all duration-300 ${confirmationStatus.familyAcknowledged ? 'bg-red-50 border-red-500 shadow-inner' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}
              >
                <div className="flex items-center text-left">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-5 ${confirmationStatus.familyAcknowledged ? 'bg-red-500 text-white shadow-lg' : 'bg-gray-200 text-gray-400'}`}>
                    <i className="fa-solid fa-house-user text-xl"></i>
                  </div>
                  <div>
                    <p className="font-black text-gray-800 uppercase text-xs tracking-widest">Family Channel</p>
                    <p className="text-sm font-medium text-gray-500">Auto-contacted</p>
                  </div>
                </div>
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${confirmationStatus.familyAcknowledged ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
                  {confirmationStatus.familyAcknowledged && <i className="fa-solid fa-check text-white text-sm"></i>}
                </div>
              </button>

              <button 
                onClick={() => setConfirmationStatus(prev => ({ ...prev, ambulanceAcknowledged: !prev.ambulanceAcknowledged }))}
                className={`w-full flex items-center justify-between p-7 rounded-2xl border-2 transition-all duration-300 ${confirmationStatus.ambulanceAcknowledged ? 'bg-blue-50 border-blue-500 shadow-inner' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}
              >
                <div className="flex items-center text-left">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-5 ${confirmationStatus.ambulanceAcknowledged ? 'bg-blue-500 text-white shadow-lg' : 'bg-gray-200 text-gray-400'}`}>
                    <i className="fa-solid fa-truck-medical text-xl"></i>
                  </div>
                  <div>
                    <p className="font-black text-gray-800 uppercase text-xs tracking-widest">Medical Team</p>
                    <p className="text-sm font-medium text-gray-500">Service Alerted</p>
                  </div>
                </div>
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${confirmationStatus.ambulanceAcknowledged ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                  {confirmationStatus.ambulanceAcknowledged && <i className="fa-solid fa-check text-white text-sm"></i>}
                </div>
              </button>
            </div>

            <button 
              onClick={() => {
                setAppState(AppState.MONITORING);
                setConfirmationStatus({ ambulanceAcknowledged: false, familyAcknowledged: false });
                autoTriggeredRef.current = false;
              }}
              className="mt-12 w-full bg-blue-700 hover:bg-blue-800 text-white font-black py-5 rounded-2xl transition shadow-xl uppercase tracking-widest text-sm"
            >
              Resume Live Surveillance
            </button>
          </div>
        )}
      </main>

      <footer className="text-center px-6 text-gray-400 text-[10px] mt-12 pb-8">
        <p className="font-black uppercase tracking-[0.2em]">Safety Intelligence v3.7-Kinetic</p>
        <p className="mt-2 opacity-50 uppercase">Autonomous Family Dispatch Armed • G-Force Calculation Active</p>
      </footer>
    </div>
  );
};

export default App;
