import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAAgV_spWyP-zH5UJY2nEjd26mKGXpy3FM",
  authDomain: "fact-view.firebaseapp.com",
  projectId: "fact-view",
  storageBucket: "fact-view.firebasestorage.app",
  messagingSenderId: "32683010470",
  appId: "1:32683010470:web:52c0b913617fd0a3100767",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
