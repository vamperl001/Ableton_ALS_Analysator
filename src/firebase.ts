import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, where, setDoc } from "firebase/firestore";
import { AlsFileStats } from "./types";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, import.meta.env.VITE_FIREBASE_DATABASE_ID);

const SESSIONS_COLLECTION = "sessions";

export async function saveSessionToCloud(session: AlsFileStats): Promise<string> {
  try {
    const colRef = collection(db, SESSIONS_COLLECTION);
    
    // Duplikatsprüfung: Gibt es bereits ein Dokument mit diesem fileName in der Cloud?
    let existingDocId: string | null = null;
    const q = query(colRef, where("fileName", "==", session.fileName));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      existingDocId = querySnapshot.docs[0].id;
    }

    const docData = {
      id: existingDocId || session.cloudDocId || Math.random().toString(36).substr(2, 9),
      fileName: session.fileName,
      fileSize: 0,
      fileType: "midi",
      sessionDate: session.date || new Date().toISOString().split('T')[0],
      tempo: session.tempo || 120,
      estimatedBpm: session.estimatedBpm || session.tempo || 120,
      notesCount: session.notesCount,
      avgVelocity: session.avgVelocity || 0,
      avgDriftMs: session.avgDriftMs || 0,
      avgSwing: session.swingFactor16th || 0,
      estimatedKey: session.estimatedKey || "Unbekannt",
      styleCategory: session.styleCategory || "Melodisch",
      structureCategory: session.structureCategory || "Klassisches Stück",
      notes: session.notes.slice(0, 1500).map(n => ({
        key: n.key,
        noteName: n.noteName,
        velocity: n.velocity,
        time: n.time,
        gridOffset: n.gridOffset || 0,
        gridOffsetMs: n.gridOffsetMs || 0,
        nearestGrid: n.nearestGrid || 0,
        trackName: n.trackName || ""
      })),
      createdAt: new Date().toISOString()
    };
    
    if (existingDocId) {
      // Wenn bereits in der Cloud vorhanden, überschreiben wir das Dokument direkt
      const existingDocRef = doc(db, SESSIONS_COLLECTION, existingDocId);
      await setDoc(existingDocRef, docData);
      return existingDocId;
    } else {
      const docRef = await addDoc(colRef, docData);
      return docRef.id;
    }
  } catch (error) {
    console.error("Fehler beim Speichern in der Cloud-Datenbank:", error);
    throw error;
  }
}

export async function loadSessionsFromCloud(): Promise<AlsFileStats[]> {
  try {
    const colRef = collection(db, SESSIONS_COLLECTION);
    const q = query(colRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const sessions: AlsFileStats[] = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const rawNotes = data.notes || [];
      const mappedNotes = rawNotes.map((n: any, idx: number) => ({
        id: n.id || `${data.fileName}-${idx}`,
        key: n.key !== undefined ? n.key : (n.pitch !== undefined ? n.pitch : 60),
        noteName: n.noteName || "C3",
        time: n.time || 0,
        duration: n.duration !== undefined ? n.duration : 0.25,
        velocity: n.velocity !== undefined ? n.velocity : 100,
        gridOffset: n.gridOffset !== undefined ? n.gridOffset : 0,
        gridOffsetMs: n.gridOffsetMs !== undefined ? n.gridOffsetMs : 0,
        nearestGrid: n.nearestGrid !== undefined ? n.nearestGrid : 0,
        trackName: n.trackName || "Midi"
      }));

      sessions.push({
        cloudDocId: doc.id,
        fileName: data.fileName,
        date: data.sessionDate || data.date || new Date().toISOString().split('T')[0],
        tempo: data.tempo || 120,
        estimatedBpm: data.estimatedBpm || data.tempo || 120,
        notesCount: data.notesCount || mappedNotes.length,
        avgVelocity: data.avgVelocity || 0,
        avgDriftMs: data.avgDriftMs || 0,
        swingFactor16th: data.avgSwing || 0,
        estimatedKey: data.estimatedKey || "Unbekannt",
        styleCategory: data.styleCategory || "Melodisch",
        structureCategory: data.structureCategory || "Klassisches Stück",
        notes: mappedNotes
      });
    });
    
    return sessions;
  } catch (error) {
    console.error("Fehler beim Laden aus der Cloud-Datenbank:", error);
    return [];
  }
}

export async function deleteSessionFromCloud(docId: string): Promise<void> {
  try {
    const docRef = doc(db, SESSIONS_COLLECTION, docId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Fehler beim Loschen aus der Cloud-Datenbank:", error);
    throw error;
  }
}
