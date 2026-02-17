
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, EmergencyContacts, AlertMessages, TriggerReason } from "../types";

/**
 * High-reliability message generation including kinetic data (X, Y, G-force).
 */
export const generateEmergencyMessages = async (
  user: UserProfile,
  location: { lat: number; lng: number } | null,
  contacts: EmergencyContacts,
  reason: TriggerReason,
  kineticData: { x: number; y: number; g: number }
): Promise<AlertMessages> => {
  const locationStr = location 
    ? `Lat: ${location.lat.toFixed(5)}, Lng: ${location.lng.toFixed(5)}. Map: https://www.google.com/maps?q=${location.lat},${location.lng}`
    : "Location data unavailable";

  const forceStats = `X: ${kineticData.x.toFixed(2)}G, Y: ${kineticData.y.toFixed(2)}G, Total: ${kineticData.g.toFixed(2)}G`;

  // FAILSAFE TEMPLATE
  const fallbackMessages: AlertMessages = {
    family: `EMERGENCY: ${user.name} had an accident. Impact: ${forceStats}. Location: ${locationStr}. Ambulance: ${contacts.ambulance}`,
    ambulance: `URGENT: Accident for ${user.name} (Age: ${user.age}, Blood: ${user.bloodGroup}). Force: ${forceStats}. Vehicle: ${user.vehicleNumber}. Location: ${locationStr}`
  };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    URGENT: Generate two emergency SMS messages.
    User: ${user.name}, Age: ${user.age}, Blood: ${user.bloodGroup}, Vehicle: ${user.vehicleNumber}.
    Event: ${reason === TriggerReason.IMPACT ? 'Accident' : 'Unusual Movement'}.
    Impact Stats: ${forceStats}.
    Location: ${locationStr}.
    Ambulance: ${contacts.ambulance}.

    JSON format with keys: "family" (inform family about the ${kineticData.g.toFixed(1)}G impact), "ambulance" (medical stats, vehicle, and precise GPS).
    Keep under 160 characters per message.
  `;

  const attemptGeneration = async (retries = 3, backoff = 1000): Promise<AlertMessages> => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              family: { type: Type.STRING },
              ambulance: { type: Type.STRING }
            },
            required: ["family", "ambulance"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty AI response");
      return JSON.parse(text) as AlertMessages;
    } catch (error: any) {
      const errorMsg = error?.message || "";
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, backoff));
        return attemptGeneration(retries - 1, backoff * 2);
      }
      throw error;
    }
  };

  try {
    return await attemptGeneration();
  } catch (err) {
    return fallbackMessages;
  }
};
