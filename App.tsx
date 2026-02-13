
import React, { useState, useEffect, useCallback, useRef } from 'react';
import RegistrationForm from './components/RegistrationForm';
import { UserProfile, AppState, EmergencyContacts, AlertMessages } from './types';
import { generateEmergencyMessages } from './services/geminiService';

const EMERGENCY_CONTACTS: EmergencyContacts = {
  ambulance: '+1-555-0199'
};

const ACCELERATION_THRESHOLD = 25; // m/s^2 - indicative of severe impact/braking
const COUNTDOWN_TIME = 20;

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.REGISTRATION);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentG, setCurrentG] = useState(0);
  const [countdown, setCountdown] = useState(COUNTDOWN_TIME);
  const [alertLogs, setAlertLogs] = useState<AlertMessages | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const countdownIntervalRef = useRef<number | null>(null);

  // Get current location
  const updateLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("Location error", err)
      );
    }
  }, []);

  useEffect(() => {
    updateLocation();
  }, [updateLocation]);

  // Handle Sensor Monitoring
  useEffect(() => {
    if (appState !== AppState.MONITORING) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      
      const totalG = Math.sqrt(
        (acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2
      );
      
      setCurrentG(totalG);

      if (totalG > ACCELERATION_THRESHOLD) {
        triggerAlert();
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [appState]);

  const triggerAlert = () => {
    setAppState(AppState.ALERT_COUNTDOWN);
    setCountdown(COUNTDOWN_TIME);
    
    // Start countdown
    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          sendAlerts();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const sendAlerts = async () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (!user) return;

    setAppState(AppState.ALERT_SENT);
    
    const messages = await generateEmergencyMessages(user, location, EMERGENCY_CONTACTS);
    setAlertLogs(messages);
    
    // Simulation of sending
    console.log("SMS sent to Ambulance:", messages.ambulance);
    console.log("SMS sent to Family:", messages.family);
  };

  const cancelAlert = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setAppState(AppState.MONITORING);
  };

  const onRegister = (userData: UserProfile) => {
    setUser(userData);
    setAppState(AppState.MONITORING);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <nav className="bg-blue-700 text-white shadow-lg p-4 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <i className="fa-solid fa-truck-medical text-2xl"></i>
            <span className="text-xl font-black tracking-tight uppercase">LifeGuard</span>
          </div>
          {user && (
            <div className="text-xs text-blue-100 flex flex-col items-end">
              <span>System Active</span>
              <span className="font-bold">{user.name}</span>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto p-4 pt-8">
        {appState === AppState.REGISTRATION && (
          <RegistrationForm onRegister={onRegister} />
        )}

        {appState === AppState.MONITORING && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-lg border-2 border-blue-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <div className="flex items-center space-x-1">
                  <span className="h-3 w-3 bg-blue-500 rounded-full animate-pulse"></span>
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Active Monitoring</span>
                </div>
              </div>
              
              <div className="flex flex-col items-center justify-center space-y-4">
                <i className="fa-solid fa-satellite-dish text-6xl text-blue-500 animate-bounce"></i>
                <h2 className="text-3xl font-black text-gray-800">Sensors Engaged</h2>
                <p className="text-gray-500 text-center max-w-sm">
                  The system is listening for high-impact patterns. Please keep your device secured in a phone mount.
                </p>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                  <p className="text-xs text-gray-400 uppercase font-bold">G-Force</p>
                  <p className="text-2xl font-mono text-gray-700">{currentG.toFixed(2)} m/s²</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                  <p className="text-xs text-gray-400 uppercase font-bold">Location</p>
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Searching GPS...'}
                  </p>
                </div>
              </div>

              <button 
                onClick={triggerAlert}
                className="mt-8 w-full bg-blue-50 text-blue-700 font-bold py-3 rounded-lg border-2 border-blue-100 hover:bg-blue-100 transition"
              >
                Simulate Impact Event
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center">
                <i className="fa-solid fa-user-shield mr-2 text-blue-600"></i> Active Profile
              </h3>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <div className="text-gray-500">Vehicle:</div><div className="font-bold">{user?.vehicleNumber}</div>
                <div className="text-gray-500">Emergency Contact:</div><div className="font-bold">{user?.emergencyContact}</div>
                <div className="text-gray-500">Blood Group:</div><div className="font-bold text-blue-600">{user?.bloodGroup}</div>
              </div>
            </div>
          </div>
        )}

        {appState === AppState.ALERT_COUNTDOWN && (
          <div className="fixed inset-0 bg-blue-600 z-[100] flex flex-col items-center justify-center p-6 text-white text-center">
            <div className="mb-8">
              <i className="fa-solid fa-triangle-exclamation text-8xl animate-pulse"></i>
            </div>
            <h1 className="text-4xl font-black mb-4 uppercase">Possible Crash Detected</h1>
            <p className="text-xl mb-12 max-w-md opacity-90">
              Emergency alerts will be sent to your family and medical services in:
            </p>
            
            <div className="text-9xl font-black mb-12 font-mono">
              {countdown}
            </div>

            <button 
              onClick={cancelAlert}
              className="w-full max-w-sm bg-white text-blue-600 font-black py-5 rounded-2xl text-2xl shadow-2xl hover:bg-gray-100 transition transform active:scale-95"
            >
              I AM OK - CANCEL
            </button>
            
            <button 
              onClick={sendAlerts}
              className="mt-6 text-white/70 underline underline-offset-4"
            >
              Send Now
            </button>
          </div>
        )}

        {appState === AppState.ALERT_SENT && (
          <div className="bg-white p-8 rounded-3xl shadow-2xl border-4 border-blue-100">
            <div className="text-center mb-10">
              <div className="bg-green-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className="fa-solid fa-check-double text-green-600 text-5xl"></i>
              </div>
              <h2 className="text-3xl font-black text-gray-800">Alerts Sent</h2>
              <p className="text-gray-500 mt-2">Emergency services and family notified with health data and GPS location.</p>
            </div>

            <div className="space-y-6">
              <h4 className="font-bold text-gray-500 uppercase tracking-widest text-xs">AI Message History</h4>
              
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black text-blue-800 text-sm tracking-tight">AMBULANCE DISPATCH</span>
                  <span className="text-xs text-blue-500">{EMERGENCY_CONTACTS.ambulance}</span>
                </div>
                <p className="text-sm text-blue-900 leading-relaxed italic">"{alertLogs?.ambulance}"</p>
              </div>

              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black text-blue-800 text-sm tracking-tight">FAMILY CONTACT</span>
                  <span className="text-xs text-blue-500">{user?.emergencyContact}</span>
                </div>
                <p className="text-sm text-blue-900 leading-relaxed italic">"{alertLogs?.family}"</p>
              </div>
            </div>

            <button 
              onClick={() => setAppState(AppState.MONITORING)}
              className="mt-10 w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-4 rounded-xl transition"
            >
              Reset Monitoring
            </button>
          </div>
        )}
      </main>

      <footer className="text-center px-6 text-gray-400 text-xs mt-8">
        <p>This system utilizes mobile hardware sensors for accident detection.</p>
        <p className="mt-1">Blue Theme Active | Towing Service Removed</p>
      </footer>
    </div>
  );
};

export default App;
