
export interface UserProfile {
  name: string;
  mobile: string;
  vehicleNumber: string;
  age: number;
  bloodGroup: string;
  address: string;
  emergencyContact: string;
}

export interface EmergencyContacts {
  ambulance: string;
}

export interface AccidentData {
  timestamp: number;
  latitude: number | null;
  longitude: number | null;
  gForce: number;
}

export interface AlertMessages {
  family: string;
  ambulance: string;
}

export enum AppState {
  REGISTRATION = 'REGISTRATION',
  MONITORING = 'MONITORING',
  ALERT_COUNTDOWN = 'ALERT_COUNTDOWN',
  ALERT_SENT = 'ALERT_SENT'
}
