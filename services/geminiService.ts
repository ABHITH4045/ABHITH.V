
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, EmergencyContacts, AlertMessages } from "../types";

export const generateEmergencyMessages = async (
  user: UserProfile,
  location: { lat: number; lng: number } | null,
  contacts: EmergencyContacts
): Promise<AlertMessages> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const locationStr = location 
    ? `Latitude: ${location.lat}, Longitude: ${location.lng}. Google Maps: https://www.google.com/maps?q=${location.lat},${location.lng}`
    : "Location unavailable (GPS error)";

  const prompt = `
    Generate two distinct, professional emergency SMS messages based on a detected vehicle accident.
    
    USER DETAILS:
    Name: ${user.name}
    Age: ${user.age}
    Blood Group: ${user.bloodGroup}
    Vehicle: ${user.vehicleNumber}
    Mobile: ${user.mobile}
    Location: ${locationStr}
    
    SERVICES:
    Ambulance Contact: ${contacts.ambulance}
    
    REQUIREMENTS:
    1. Message for Family: Inform them of the accident, provide the location, and give them the specific ambulance number dispatched.
    2. Message for Ambulance: Provide user health details (age, blood group), vehicle number, and precise location for immediate medical response.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            family: { type: Type.STRING, description: "SMS for family" },
            ambulance: { type: Type.STRING, description: "SMS for ambulance" }
          },
          required: ["family", "ambulance"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result as AlertMessages;
  } catch (error) {
    console.error("AI Generation Error:", error);
    return {
      family: `EMERGENCY: Accident detected for ${user.name} at ${locationStr}. Ambulance dispatched: ${contacts.ambulance}`,
      ambulance: `URGENT: Accident for ${user.name} (Blood: ${user.bloodGroup}, Age: ${user.age}, Vehicle: ${user.vehicleNumber}). Loc: ${locationStr}`
    };
  }
};
