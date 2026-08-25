import type { Loc } from "@/shared/types";

export interface FoodJoint {
  id: string;
  name: Loc;
  speciality: Loc;
  area: Loc;
  lat: number;
  lng: number;
  phone?: string;
  price?: { min: number; max: number };
}

export const FOOD_JOINTS: FoodJoint[] = [
  {
    id: "sagar-ratna-pipli",
    name: { en: "Sagar Ratna", hi: "सागर रत्ना" },
    speciality: { en: "Pure Veg South Indian & North Indian Thali", hi: "शुद्ध शाकाहारी दक्षिण और उत्तर भारतीय थाली" },
    area: { en: "GT Road, Pipli", hi: "जी.टी. रोड, पीपली" },
    lat: 29.9822,
    lng: 76.8835,
    phone: "+91 1744 230101",
    price: { min: 250, max: 600 }
  },
  {
    id: "haveli-pipli",
    name: { en: "Haveli Restaurant", hi: "हवेली रेस्टोरेंट" },
    speciality: { en: "Traditional Punjabi Cuisine & Lassi", hi: "पारंपरिक पंजाबी भोजन और लस्सी" },
    area: { en: "Near Pipli Chowk", hi: "पीपली चौक के पास" },
    lat: 29.9855,
    lng: 76.8850,
    phone: "+91 1744 290290",
    price: { min: 300, max: 800 }
  },
  {
    id: "brahma-sarovar-foodcourt",
    name: { en: "Brahma Sarovar Food Court", hi: "ब्रह्म सरोवर फ़ूड कोर्ट" },
    speciality: { en: "Local Street Food, Chaat & Chur Chur Naan", hi: "स्थानीय स्ट्रीट फ़ूड, चाट और चूर-चूर नान" },
    area: { en: "Brahma Sarovar East Gate", hi: "ब्रह्म सरोवर पूर्वी गेट" },
    lat: 29.9655,
    lng: 76.8375,
    price: { min: 80, max: 200 }
  },
  {
    id: "bhajan-lal-halwai",
    name: { en: "Bhajan Lal Halwai", hi: "भजन लाल हलवाई" },
    speciality: { en: "Kachori Sabzi, Jalebi & Lassi", hi: "कचौड़ी सब्जी, जलेबी और लस्सी" },
    area: { en: "Main Bazar", hi: "मुख्य बाजार" },
    lat: 29.9630,
    lng: 76.8290,
    price: { min: 50, max: 150 }
  },
  {
    id: "chhabra-sweets",
    name: { en: "Chhabra Restaurant & Sweets", hi: "छाबड़ा रेस्टोरेंट एवं स्वीट्स" },
    speciality: { en: "Chole Bhature, Samosa & North Indian Meals", hi: "छोले भटूरे, समोसा और उत्तर भारतीय भोजन" },
    area: { en: "Near Railway Station Rd", hi: "रेलवे स्टेशन रोड के पास" },
    lat: 29.9685,
    lng: 76.8420,
    phone: "+91 98960 40400",
    price: { min: 120, max: 350 }
  },
  {
    id: "amrik-sukhdev-pipli",
    name: { en: "Amrik Sukhdev Express", hi: "अमरीक सुखदेव एक्सप्रेस" },
    speciality: { en: "Famous Stuffed Paranthas with white butter", hi: "सफेद मक्खन के साथ प्रसिद्ध भरवां परांठे" },
    area: { en: "Pipli Bypass GT Road", hi: "पीपली बाईपास जी.टी. रोड" },
    lat: 29.9790,
    lng: 76.8810,
    price: { min: 150, max: 400 }
  }
];
