import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, collection, query, writeBatch } from 'firebase/firestore';
// eslint-disable-next-line
import { Plus, Users, Utensils, ThumbsUp, ThumbsDown, Search, Trash2, Pencil, X, Check, CalendarCheck, ArrowUp, ArrowDown, Sparkles, MoreVertical, Edit, Users2, Link as LinkIcon } from 'lucide-react';
import { getAnalytics } from "firebase/analytics";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// --- Firebase Initialization (Singleton Pattern) ---
let db, auth;
try {
    const app = initializeApp(firebaseConfig);
    getAnalytics(app);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase initialization failed at the top level:", e);
}


// --- Helper Functions ---
const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
};

const setCookie = (name, value, days) => {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days*24*60*60*1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/";
};

const getInitialTheme = () => {
    const savedTheme = getCookie("lunchTrackerTheme");
    if (savedTheme) return savedTheme === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
};

if (getInitialTheme()) {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}

const formatDate = (dateString) => {
    if (!dateString) return "Not visited recently";
    const date = new Date(dateString);
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    if (date < threeMonthsAgo) return "Not visited recently";
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    date.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    yesterday.setHours(0, 0, 0, 0);
    if (date.getTime() === today.getTime()) return "Visited: Today";
    if (date.getTime() === yesterday.getTime()) return "Visited: Yesterday";
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    let interval = seconds / 2592000;
    if (interval > 1) return `Visited: ${Math.floor(interval)} months ago`;
    interval = seconds / 86400;
    if (interval > 1) return `Visited: ${Math.floor(interval)} days ago`;
    return `Visited: ${new Date(dateString).toLocaleDateString()}`;
};

const formatStatusTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.round((now - date) / 1000);
    if (diffSeconds < 5) return "just now";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};


const App = () => {
    // --- State Management ---
    const [groups, setGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState(getCookie("selectedGroupId") || null);
    
    const [restaurants, setRestaurants] = useState([]);
    const [friends, setFriends] = useState([]);
    const [whosIn, setWhosIn] = useState([]);
    const [myName, setMyName] = useState('');
    const [mySuggestion, setMySuggestion] = useState('');
    const [isGoing, setIsGoing] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [showAddRestaurantModal, setShowAddRestaurantModal] = useState(false);
    const [showEditRestaurantModal, setShowEditRestaurantModal] = useState(false);
    const [newRestaurantName, setNewRestaurantName] = useState('');
    const [newRestaurantNickname, setNewRestaurantNickname] = useState('');
    const [newRestaurantDesc, setNewRestaurantDesc] = useState('');
    const [newRestaurantAddress, setNewRestaurantAddress] = useState('');
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingRestaurant, setEditingRestaurant] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'lastVisited', direction: 'ascending' });
    const [tooltip, setTooltip] = useState({ visible: false, data: null, x: 0, y: 0 });
    const [userLocation, setUserLocation] = useState(null);
    const [useBrowserLocation, setUseBrowserLocation] = useState(false);
    const [openMenuId, setOpenMenuId] = useState(null);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [groupLocation, setGroupLocation] = useState('');
    const [editingGroup, setEditingGroup] = useState(null);
    const [lastVisitedTooltip, setLastVisitedTooltip] = useState({ visible: false, data: null, x: 0, y: 0 });
    
    // Gemini API State & Shared Vibe
    const [lunchVibe, setLunchVibe] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    // Firebase state
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // --- Effects ---
    useEffect(() => {
        const savedName = getCookie("lunchTrackerName");
        if (savedName) setMyName(savedName);
        const savedSuggestion = getCookie("lunchTrackerSuggestion");
        if (savedSuggestion) setMySuggestion(savedSuggestion);

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e) => e.matches ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark');
        handleChange(mediaQuery);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);
    
    useEffect(() => {
        if (useBrowserLocation && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
                (err) => {
                    console.error("Geolocation error:", err.message);
                    setError("Could not get location. Using default location for bonus suggestions.");
                    setUserLocation(null); 
                }
            );
        } else if (!useBrowserLocation) setUserLocation(null);
    }, [useBrowserLocation]);

    useEffect(() => {
        if (!auth) { setError("Database connection not available."); return; }
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) setUserId(user.uid);
            else try { await signInAnonymously(auth); } catch (e) { console.error("Anonymous sign-in error:", e); setError("Failed to authenticate."); }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (isAuthReady && userId && db) {
            const groupsQuery = query(collection(db, "groups"));
            const unsubscribeGroups = onSnapshot(groupsQuery, (querySnapshot) => {
                const groupsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setGroups(groupsData);
                if ((!selectedGroupId || !groupsData.find(g => g.id === selectedGroupId)) && groupsData.length > 0) {
                    const newSelectedGroupId = groupsData[0].id;
                    setSelectedGroupId(newSelectedGroupId);
                    setCookie("selectedGroupId", newSelectedGroupId, 365);
                } else if (groupsData.length === 0) {
                    addDoc(collection(db, "groups"), { name: "My First Group", defaultLocation: "Irvine, CA", friends: [], whosIn: [], lunchVibe: '', suggestions: [] })
                      .then(docRef => setSelectedGroupId(docRef.id));
                }
            });
            
            const restaurantsDocRef = doc(db, "restaurants", "shared-list");
            const unsubscribeRestaurants = onSnapshot(restaurantsDocRef, (doc) => {
                if (doc.exists()) setRestaurants(doc.data().list || []);
                else setDoc(restaurantsDocRef, { list: [] });
            });
            
            return () => { unsubscribeGroups(); unsubscribeRestaurants(); };
        }
    }, [isAuthReady, userId, selectedGroupId]);

    useEffect(() => {
        if (selectedGroupId && db) {
            const groupDocRef = doc(db, "groups", selectedGroupId);
            const unsubscribe = onSnapshot(groupDocRef, (doc) => {
                if (doc.exists()) {
                    const data = doc.data();
                    setWhosIn(data.whosIn || []);
                    setFriends(data.friends || []);
                    setLunchVibe(data.lunchVibe || '');
                    setSuggestions(data.suggestions || []);
                }
            });
            return () => unsubscribe();
        }
    }, [selectedGroupId]);
    
    useEffect(() => {
        if(myName) {
             const myStatus = whosIn.find(person => person.name === myName);
             setIsGoing(!!myStatus);
             if(myStatus) setMySuggestion(myStatus.suggestion || '');
        }
    }, [whosIn, myName]);

    // --- Gemini API Calls ---
    const callGeminiAPI = async (prompt, schema = null) => {
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        if (!apiKey) throw new Error("Gemini API key is missing.");
        const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
        if (schema) payload.generationConfig = { responseMimeType: "application/json", responseSchema: schema };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody?.error?.message || `API Error: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (result.candidates && result.candidates[0].content.parts[0].text) return result.candidates[0].content.parts[0].text;
        throw new Error("Invalid response from Gemini API.");
    };

    const generateAIDescription = async (userInput, originalDescription = null, instruction = null) => {
        let prompt = instruction ? `Rewrite this restaurant description: "${originalDescription}" with this instruction: "${instruction}". Make it very short, punchy, and fun. Return only the new sentence.` : `Based on this user input: "${userInput}", write a very short, punchy, and fun one-sentence description for a restaurant. Example: "Juicy burgers and crispy fries."`;
        if (!userInput.trim() && !instruction) return "A great place to eat with friends!";
        try {
            const textResponse = await callGeminiAPI(prompt);
            return textResponse.trim().replace(/"/g, '');
        } catch(e) {
            console.error("AI Description generation failed:", e);
            setError(`AI description failed: ${e.message}`);
            return originalDescription || userInput;
        }
    };
    
    const handleGetVibeSuggestions = async () => {
        if (restaurants.length === 0) { setError("Add some restaurants first!"); return; }
        if (!lunchVibe.trim() && whosIn.every(p => !p.suggestion)) { setError("Describe the lunch vibe or add individual suggestions."); return; }

        setIsGenerating(true);
        setError('');
        
        try {
            const selectedGroup = groups.find(g => g.id === selectedGroupId);
            const groupLocation = selectedGroup?.defaultLocation || 'Irvine, CA';

            const individualPreferences = whosIn.filter(p => p.suggestion).map(p => `${p.name} wants ${p.suggestion}`).join('. ');
            const listPrompt = `You are a fun, quirky AI assistant helping friends decide on a lunch spot. The group's default location is ${groupLocation}. The friends going are: ${whosIn.map(p => p.name).join(', ') || 'everyone'}. Their combined vibe is: "${lunchVibe}". Individual preferences are: ${individualPreferences || 'None specified'}. From the list of restaurants below, please pick up to 4 that best match the overall vibe, individual preferences, and are a reasonable distance from the group's location. Return only the names of the restaurants as a simple JSON array of strings. Restaurant List: ${JSON.stringify(restaurants.map(r => ({name: r.name, description: r.description, rating: r.rating, address: r.address})))}`;
            const listSchema = { type: "OBJECT", properties: { "recommendations": { type: "ARRAY", items: { "type": "STRING" } } }, required: ["recommendations"] };
            
            const listResponse = await callGeminiAPI(listPrompt, listSchema);
            const json = JSON.parse(listResponse);
            const recommendedNames = json.recommendations || [];

            const baseSuggestions = recommendedNames.map(name => {
                const restaurant = restaurants.find(r => r.name === name);
                return restaurant ? { name: restaurant.name, address: restaurant.address, reasoning: restaurant.description || "A great place!" } : null;
            }).filter(Boolean);
            
            const locationQuery = userLocation ? `near latitude ${userLocation.latitude} and longitude ${userLocation.longitude}` : `near ${groupLocation}`;
            const bonusPrompt = `Suggest a specific, real restaurant that is not on this list: [${restaurants.map(r => `"${r.name}"`).join(', ')}]. This restaurant should be ${locationQuery} and match a "${lunchVibe}" vibe. Then, write a short, fun, one-sentence reason why someone should try it. Return the name, its address, and the reason in a JSON object like {"name": "Restaurant Name", "address": "123 Main St, City, State", "reasoning": "Reason here"}.`;
            const bonusSchema = { type: "OBJECT", properties: { "name": { "type": "STRING" }, "address": { "type": "STRING" }, "reasoning": { "type": "STRING" } }, required: ["name", "address", "reasoning"] };

            const bonusResponse = await callGeminiAPI(bonusPrompt, bonusSchema);
            const bonusJson = JSON.parse(bonusResponse);
            const bonusSuggestion = { name: bonusJson.name, address: bonusJson.address, reasoning: bonusJson.reasoning.trim().replace(/"/g, ''), isBonus: true };
            
            await updateGroupDoc({ suggestions: [...baseSuggestions, bonusSuggestion] });

        } catch(e) {
            console.error("Gemini suggestion failed:", e);
            setError(`Could not get suggestions: ${e.message}`);
        } finally {
            setIsGenerating(false);
        }
    };
    
    // --- Data Update & Sorting ---
    const updateGroupDoc = async (data) => {
        if (!selectedGroupId) return;
        const groupDocRef = doc(db, "groups", selectedGroupId);
        try {
            await setDoc(groupDocRef, data, { merge: true });
        } catch (e) {
            console.error("Firestore group update failed:", e);
            setError("Failed to save group changes.");
            throw e;
        }
    };

    const updateRestaurantsDoc = async(newRestaurants) => {
        const restaurantsDocRef = doc(db, "restaurants", "shared-list");
        await setDoc(restaurantsDocRef, { list: newRestaurants });
    };
    
    const sortedRestaurants = useMemo(() => {
        return [...restaurants].sort((a, b) => {
            if (sortConfig.key === 'lastVisited') {
                const aDate = a.lastVisited?.[selectedGroupId] ? new Date(a.lastVisited[selectedGroupId]).getTime() : 0;
                const bDate = b.lastVisited?.[selectedGroupId] ? new Date(b.lastVisited[selectedGroupId]).getTime() : 0;
                if (sortConfig.direction === 'ascending') {
                    if (aDate === 0 && bDate !== 0) return -1;
                    if (bDate === 0 && aDate !== 0) return 1;
                    return aDate - bDate;
                } else return bDate - aDate;
            }
            return sortConfig.direction === 'ascending' ? a.rating - b.rating : b.rating - a.rating;
        });
    }, [restaurants, sortConfig, selectedGroupId]);

    // --- Event Handlers ---
    const handleMouseMove = (e) => {
        if (tooltip.visible) setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
        if (lastVisitedTooltip.visible) setLastVisitedTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
    };

    const handleMouseEnter = (e, restaurant) => {
        if (!editingRestaurant) {
            setTooltip({ visible: true, data: restaurant, x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseLeave = () => {
        setTooltip({ visible: false, data: null, x: 0, y: 0 });
    };

    const handleLastVisitedMouseEnter = (e, restaurant) => {
        const otherGroupsVisited = Object.entries(restaurant.lastVisited || {})
            .filter(([groupId, date]) => groupId !== selectedGroupId && date)
            .map(([groupId, date]) => {
                const group = groups.find(g => g.id === groupId);
                return { groupName: group ? group.name : 'Unknown Group', date };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (otherGroupsVisited.length > 0) {
            setLastVisitedTooltip({
                visible: true,
                data: otherGroupsVisited,
                x: e.clientX,
                y: e.clientY
            });
        }
    };

    const handleLastVisitedMouseLeave = () => {
        setLastVisitedTooltip({ visible: false, data: null, x: 0, y: 0 });
    };


    const handleSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        else if (sortConfig.key === key && sortConfig.direction === 'descending') direction = 'ascending';
        else direction = key === 'rating' ? 'descending' : 'ascending';
        setSortConfig({ key, direction });
    };

    const handleNameChange = (e) => {
        setMyName(e.target.value);
        setCookie("lunchTrackerName", e.target.value, 365);
    };
    
    const handleSuggestionChange = (e) => {
        const suggestion = e.target.value;
        setMySuggestion(suggestion);
        setCookie("lunchTrackerSuggestion", suggestion, 365);
        if (isGoing) {
            const updatedWhosIn = whosIn.map(person => person.name === myName ? { ...person, suggestion: e.target.value, updated: new Date().toISOString() } : person);
            updateGroupDoc({ whosIn: updatedWhosIn });
        }
    };
    
    const handleGoingToggle = async () => {
        if (!myName.trim() || !selectedGroupId) { setError("Please enter your name and select a group first."); return; }
        
        const newIsGoing = !isGoing;
        setIsGoing(newIsGoing);
        const trimmedName = myName.trim();
        const batch = writeBatch(db);

        groups.forEach(group => {
            if (group.id !== selectedGroupId) {
                const otherGroupRef = doc(db, "groups", group.id);
                const currentWhosIn = group.whosIn || [];
                batch.update(otherGroupRef, {
                    whosIn: currentWhosIn.filter(p => p.name !== trimmedName),
                });
            }
        });
        
        const currentGroupRef = doc(db, "groups", selectedGroupId);
        let updatedWhosIn = whosIn.filter(p => p.name !== trimmedName);
        if (newIsGoing) {
            updatedWhosIn.push({ name: trimmedName, updated: new Date().toISOString(), suggestion: mySuggestion });
        }
        const updatedFriends = [...new Set([...friends, trimmedName])];
        batch.update(currentGroupRef, { whosIn: updatedWhosIn, friends: updatedFriends });
        
        try {
            await batch.commit();
        } catch (e) {
            console.error("Error updating status:", e);
            setError("Failed to update your status. Please try again.");
            setIsGoing(!newIsGoing); // Revert UI
        }
    };


    const handleAddRestaurant = async (e) => {
        e.preventDefault();
        if (newRestaurantName.trim() === '') { setError("Restaurant name is required."); return; }
        if (restaurants.some(r => r.name.toLowerCase() === newRestaurantName.trim().toLowerCase())) { setError("This restaurant already exists."); return; }
        
        setIsGenerating(true);
        const aiDescription = await generateAIDescription(newRestaurantDesc);
        setIsGenerating(false);

        const newRestaurant = { id: Date.now(), name: newRestaurantName.trim(), nickname: newRestaurantNickname.trim(), rating: 0, lastVisited: {}, description: aiDescription, address: newRestaurantAddress };
        await updateRestaurantsDoc([...restaurants, newRestaurant]);
        
        setNewRestaurantName('');
        setNewRestaurantNickname('');
        setNewRestaurantDesc('');
        setNewRestaurantAddress('');
        setShowAddRestaurantModal(false);
    };

    const handleVisitToday = async (restaurantId) => {
        const updatedRestaurants = restaurants.map(r => {
            if (r.id === restaurantId) {
                const lastVisitedByGroup = (typeof r.lastVisited === 'object' && r.lastVisited !== null) ? r.lastVisited : {};
                return { ...r, lastVisited: { ...lastVisitedByGroup, [selectedGroupId]: new Date().toISOString() } };
            }
            return r;
        });
        await updateRestaurantsDoc(updatedRestaurants);
    };

    const handleDeleteRestaurant = async (idToDelete) => {
        const updatedRestaurants = restaurants.filter(r => r.id !== idToDelete);
        await updateRestaurantsDoc(updatedRestaurants);
    };

    const handleSaveEdit = async () => {
        if (!editingRestaurant || !editingRestaurant.name.trim()) { setError("Restaurant name cannot be empty."); return; }
        
        let finalDescription = editingRestaurant.description;

        // Only call AI if there's an update instruction
        if (editingRestaurant.updateInstruction?.trim()) {
            setIsGenerating(true);
            finalDescription = await generateAIDescription(null, editingRestaurant.description, editingRestaurant.updateInstruction);
            setIsGenerating(false);
        }

        const updatedRestaurants = restaurants.map(r => r.id === editingRestaurant.id ? { ...r, name: editingRestaurant.name.trim(), nickname: editingRestaurant.nickname.trim(), description: finalDescription, address: editingRestaurant.address } : r);
        await updateRestaurantsDoc(updatedRestaurants);
        setEditingRestaurant(null);
        setShowEditRestaurantModal(false);
    };

    const updateRating = async (restaurantId, change) => {
        const updatedRestaurants = restaurants.map(r => r.id === restaurantId ? { ...r, rating: r.rating + change } : r);
        await updateRestaurantsDoc(updatedRestaurants);
    };

    const handleGroupChange = (e) => {
        const newGroupId = e.target.value;
        setSelectedGroupId(newGroupId);
        setCookie("selectedGroupId", newGroupId, 365);
    };
    
    const handleGroupAction = async () => {
        if (!groupName.trim()) { setError("Group name cannot be empty."); return; }
        if (editingGroup) { // Editing existing group
            const groupDocRef = doc(db, "groups", editingGroup.id);
            await updateDoc(groupDocRef, { name: groupName, defaultLocation: groupLocation });
        } else { // Adding new group
            await addDoc(collection(db, "groups"), { name: groupName, defaultLocation: groupLocation, friends: [], whosIn: [], lunchVibe: '', suggestions: [] });
        }
        setGroupName('');
        setGroupLocation('');
        setEditingGroup(null);
        setShowGroupModal(false);
    };
    
    const handleDeleteGroup = async () => {
        if(groups.length <= 1) {
            setError("You can't delete the last group!");
            return;
        }
        if (window.confirm(`Are you sure you want to delete the group "${groups.find(g => g.id === selectedGroupId)?.name}"?`)) {
            await deleteDoc(doc(db, "groups", selectedGroupId));
            const newSelectedGroup = groups.find(g => g.id !== selectedGroupId);
            setSelectedGroupId(newSelectedGroup?.id || null);
        }
    };
    
    const filteredRestaurants = sortedRestaurants.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.nickname && r.nickname.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    
    const fourHoursAgo = useMemo(() => {
        const date = new Date();
        date.setHours(date.getHours() - 4);
        return date;
    }, []);

    const whosInRecently = whosIn.filter(person => person.updated && new Date(person.updated) > fourHoursAgo);
    const whosInNames = whosIn.map(p => p.name);
    const whosOut = friends.filter(friend => !whosInNames.includes(friend));
    
    const bonusSuggestion = suggestions.find(s => s.isBonus);
    const normalSuggestions = suggestions.filter(s => !s.isBonus);
    const currentGroup = groups.find(g => g.id === selectedGroupId);

    return (
        <div className="bg-gray-50 dark:bg-gray-900 min-h-screen font-sans text-gray-800 dark:text-white" onMouseMove={handleMouseMove}>
            <style>{`
                .custom-scrollbar {
                    scrollbar-width: thin;
                    scrollbar-color: #d1d5db transparent;
                }
                .dark .custom-scrollbar {
                    scrollbar-color: #4b5563 transparent;
                }
                .custom-scrollbar::-webkit-scrollbar {
                  width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                  background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                  background-color: #d1d5db;
                  border-radius: 20px;
                  border: 2px solid transparent;
                  background-clip: content-box;
                }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb {
                  background-color: #4b5563;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background-color: #9ca3af;
                }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background-color: #6b7280;
                }
            `}</style>
            {tooltip.visible && tooltip.data && (
                <div style={{ top: tooltip.y + 20, left: tooltip.x + 20 }} className="fixed z-50 p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg shadow-xl max-w-xs pointer-events-none">
                    <p className="font-bold">{tooltip.data.name}</p>
                    {tooltip.data.address && <p className="text-xs text-gray-500 dark:text-gray-400">{tooltip.data.address}</p>}
                    <p className="mt-2 text-sm">{tooltip.data.description}</p>
                </div>
            )}
            {lastVisitedTooltip.visible && lastVisitedTooltip.data && (
                <div style={{ top: lastVisitedTooltip.y + 20, left: lastVisitedTooltip.x + 20, zIndex: 60 }} className="fixed p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg shadow-xl max-w-xs pointer-events-none">
                    <p className="font-bold text-sm mb-2">Last visited by other groups:</p>
                    <ul className="space-y-1">
                        {lastVisitedTooltip.data.map(({ groupName, date }) => (
                            <li key={groupName} className="text-xs">
                                <span className="font-semibold">{groupName}:</span> {formatDate(date).replace('Visited: ', '')}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div className="container mx-auto p-4 md:p-8 max-w-6xl">
                <header className="text-center mb-8 relative">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-800 dark:text-white">Super Lunch Buddies</h1>
                </header>
                
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-md mb-8">
                     <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <input type="text" value={myName} onChange={handleNameChange} placeholder="Enter your name..." className="flex-grow w-full sm:w-1/3 p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500"/>
                            <div className="flex items-center gap-2 flex-grow w-full sm:w-1/3">
                                <Users2 className="text-gray-400" />
                                <select value={selectedGroupId || ''} onChange={handleGroupChange} className="flex-grow p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500">
                                    {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                                </select>
                                 <div className="relative">
                                    <button onClick={() => setOpenMenuId('group-menu')} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"><MoreVertical /></button>
                                    {openMenuId === 'group-menu' && (
                                         <div onMouseLeave={() => setOpenMenuId(null)} className="absolute top-10 right-0 z-20 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col items-start w-40">
                                             <button onClick={() => {setShowGroupModal(true); setEditingGroup(null); setGroupName(''); setGroupLocation(''); setOpenMenuId(null);}} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><Plus size={14}/> Add Group</button>
                                             <button onClick={() => {const group = groups.find(g => g.id === selectedGroupId); if (group) {setShowGroupModal(true); setEditingGroup(group); setGroupName(group.name); setGroupLocation(group.defaultLocation); setOpenMenuId(null);}}} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><Edit size={14}/> Edit Group</button>
                                             <button onClick={() => {handleDeleteGroup(); setOpenMenuId(null);}} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50"><Trash2 size={14}/> Delete Group</button>
                                         </div>
                                    )}
                                 </div>
                            </div>
                           <label className="flex items-center cursor-pointer flex-shrink-0">
                                <span className="mr-3 text-lg font-medium dark:text-gray-300">I'm Out</span>
                                <div className="relative">
                                    <input type="checkbox" checked={isGoing} onChange={handleGoingToggle} className="sr-only peer" />
                                    <div className="w-14 h-8 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-[4px] after:bg-white after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-500"></div>
                                </div>
                                <span className="ml-3 text-lg font-medium dark:text-gray-300">I'm In!</span>
                            </label>
                        </div>
                        <div className="w-full">
                           <input type="text" value={mySuggestion} onChange={handleSuggestionChange} placeholder="Where do you want to go? (optional)" className="w-full p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500"/>
                        </div>
                    </div>
                </div>

                {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
                    <strong className="font-bold">Oops! </strong> <span className="block sm:inline">{error}</span>
                    <button onClick={() => setError('')} className="absolute top-0 bottom-0 right-0 px-4 py-3"><X size={20}/></button>
                </div>}

                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-8">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-md hover:shadow-lg">
                            <h2 className="text-2xl font-bold mb-4 flex items-center dark:text-white"><Users className="mr-3 text-green-500"/>Who's In?</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {whosInRecently.length > 0 ? whosInRecently.map(person => ( 
                                    <div key={person.name} className="flex flex-col items-center justify-center p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-center">
                                        <span className="text-md font-medium dark:text-gray-200">{person.name}</span>
                                        {person.suggestion && <span className="text-xs italic text-teal-600 dark:text-teal-400">{person.suggestion}</span>}
                                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatStatusTime(person.updated)}</span>
                                    </div> 
                                )) : <p className="text-gray-500 dark:text-gray-400 col-span-full text-center">No one has checked in recently.</p>}
                            </div>
                            {whosOut.length > 0 && whosIn.length > 0 && <hr className="my-4 border-gray-200 dark:border-gray-600"/>}
                            {whosOut.length > 0 && ( <div> <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">OUT:</h3> <p className="text-gray-600 dark:text-gray-300 leading-snug">{whosOut.join(', ')}</p> </div> )}
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-md hover:shadow-lg">
                             <div className="text-center mb-4">
                                <h2 className="text-2xl font-bold flex items-center justify-center dark:text-white"><Sparkles className="mr-3 text-amber-500"/>What's the vibe?</h2>
                                <p className="text-xs text-gray-400 dark:text-gray-500">Powered by Gemini</p>
                            </div>
                             <div className="flex flex-col items-center justify-center mb-3">
                                <label className="flex items-center cursor-pointer">
                                    <span className="mr-3 text-sm font-medium dark:text-gray-300">Default Group Location</span>
                                    <div className="relative">
                                        <input type="checkbox" checked={useBrowserLocation} onChange={() => setUseBrowserLocation(!useBrowserLocation)} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                    </div>
                                    <span className="ml-3 text-sm font-medium dark:text-gray-300">My Location</span>
                                </label>
                                <p className="text-xs text-gray-400 mt-1">{currentGroup?.defaultLocation || 'No location set'}</p>
                            </div>
                             <input type="text" value={lunchVibe} onChange={(e) => updateGroupDoc({ lunchVibe: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleGetVibeSuggestions(); } }} placeholder="e.g. cheap & cheerful" className="w-full p-3 mb-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500"/>
                            <button onClick={handleGetVibeSuggestions} disabled={isGenerating} className="w-full bg-amber-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-amber-600 flex items-center justify-center text-lg disabled:bg-gray-400 disabled:cursor-not-allowed">
                                {isGenerating ? 'Thinking...' : '✨ Get Vibe Suggestions'}
                            </button>
                            {suggestions.length > 0 && (
                                <div className="mt-5 space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {normalSuggestions.map((s, i) => (
                                            <div key={i} className="text-center p-3 rounded-lg bg-gray-100 dark:bg-gray-700">
                                                <div className="flex justify-center items-center gap-1.5 font-semibold text-md dark:text-white">
                                                    <a href={`https://www.google.com/search?q=${encodeURIComponent(s.name + " " + s.address)}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
                                                        <LinkIcon size={12} />
                                                    </a>
                                                    <span>{s.name}</span>
                                                </div>
                                                <p className="text-xs text-amber-600 dark:text-amber-400 italic">"{s.reasoning}"</p>
                                            </div>
                                        ))}
                                    </div>
                                    {bonusSuggestion && (
                                        <div>
                                            <h3 className="text-center italic text-sm text-gray-500 dark:text-gray-400 mb-2">A restaurant idea you might not have considered...</h3>
                                            <div className="text-center p-3 rounded-lg bg-green-100 dark:bg-green-900 border border-green-500">
                                                <div className="flex justify-center items-center gap-1.5 font-semibold text-md text-gray-800 dark:text-white">
                                                    <a href={`https://www.google.com/search?q=${encodeURIComponent(bonusSuggestion.name + " " + bonusSuggestion.address)}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded-full hover:bg-green-200 dark:hover:bg-green-800">
                                                        <LinkIcon size={12} />
                                                    </a>
                                                    <span>{bonusSuggestion.name}</span>
                                                </div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{bonusSuggestion.address}</p>
                                                <p className="text-xs text-green-700 dark:text-green-300 italic">"{bonusSuggestion.reasoning}"</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-md hover:shadow-lg flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold flex items-center dark:text-white"><Utensils className="mr-3 text-teal-500"/>Restaurants</h2>
                            <button onClick={() => setShowAddRestaurantModal(true)} className="flex items-center bg-teal-500 text-white font-bold py-2 px-3 rounded-lg hover:bg-teal-600">
                                <Plus size={16} className="mr-1"/>Add
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Sort by:</span>
                            <button onClick={() => handleSort('lastVisited')} className={`flex items-center gap-1 px-3 py-1 text-sm rounded-full ${sortConfig.key === 'lastVisited' ? 'bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
                                Last Visited {sortConfig.key === 'lastVisited' && (sortConfig.direction === 'ascending' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                            </button>
                             <button onClick={() => handleSort('rating')} className={`flex items-center gap-1 px-3 py-1 text-sm rounded-full ${sortConfig.key === 'rating' ? 'bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
                                Popularity {sortConfig.key === 'rating' && (sortConfig.direction === 'ascending' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                            </button>
                        </div>
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search restaurants..." className="w-full p-3 pl-10 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500"/>
                        </div>
                        <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-2 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                           {filteredRestaurants.map((r) => (
                                <div key={r.id} className="group relative flex flex-col p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <div className="w-full flex justify-between items-start flex-grow">
                                        <div className="flex-grow">
                                            <div className="flex items-center gap-1.5">
                                                <a href={`https://www.google.com/search?q=${encodeURIComponent(r.name + " " + r.address)}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
                                                    <LinkIcon size={12} className="text-blue-500" />
                                                </a>
                                                <span className="text-md font-semibold dark:text-gray-200"
                                                    onMouseEnter={(e) => handleMouseEnter(e, r)}
                                                    onMouseLeave={handleMouseLeave}>
                                                    {r.nickname || r.name}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400"
                                                onMouseEnter={(e) => handleLastVisitedMouseEnter(e, r)}
                                                onMouseLeave={handleLastVisitedMouseLeave}>
                                                {formatDate(r.lastVisited?.[selectedGroupId])}
                                            </p>
                                        </div>
                                         <div className="flex items-center gap-2">
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-lg dark:text-gray-300">{r.rating}</span>
                                            </div>
                                            <button onClick={() => setOpenMenuId(openMenuId === r.id ? null : r.id)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
                                                <MoreVertical size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {openMenuId === r.id && (
                                        <div className="absolute top-10 right-4 z-10 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col items-start">
                                            <button onClick={() => {updateRating(r.id, 1); setOpenMenuId(null);}} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><ThumbsUp size={14}/> Rate Up</button>
                                            <button onClick={() => {updateRating(r.id, -1); setOpenMenuId(null);}} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><ThumbsDown size={14}/> Rate Down</button>
                                            <button onClick={() => {handleVisitToday(r.id); setOpenMenuId(null);}} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><CalendarCheck size={14}/> Visited Today</button>
                                            <button onClick={() => {setEditingRestaurant({id: r.id, name: r.name, nickname: r.nickname || '', description: r.description, address: r.address, updateInstruction: ''}); setShowEditRestaurantModal(true); setOpenMenuId(null);}} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={14}/> Edit</button>
                                            <button onClick={() => {handleDeleteRestaurant(r.id); setOpenMenuId(null);}} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50"><Trash2 size={14}/> Delete</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <footer className="text-center mt-8 py-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Have feedback or found a bug?{' '}
                        <a
                            href="https://github.com/zuccone/super-lunch-buddies/issues"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-indigo-500 dark:hover:text-indigo-400"
                        >Open an issue on GitHub</a>.
                    </p>
                </footer>
            </div>
            
            {showAddRestaurantModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-md w-full">
                        <h3 className="text-2xl font-bold mb-4 dark:text-white">Add a New Restaurant</h3>
                        <form onSubmit={handleAddRestaurant}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Restaurant Name</label>
                                    <input type="text" value={newRestaurantName} onChange={(e) => setNewRestaurantName(e.target.value)} placeholder="e.g., The Spicy Spoon" className="w-full p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-teal-500"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nickname (optional)</label>
                                    <input type="text" value={newRestaurantNickname} onChange={(e) => setNewRestaurantNickname(e.target.value)} placeholder="e.g., The Spoon" className="w-full p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-teal-500"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                                    <input type="text" value={newRestaurantAddress} onChange={(e) => setNewRestaurantAddress(e.target.value)} placeholder="e.g., 123 Main St, Irvine, CA" className="w-full p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-teal-500"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Describe it for the AI</label>
                                    <input type="text" value={newRestaurantDesc} onChange={(e) => setNewRestaurantDesc(e.target.value)} placeholder="e.g., thai food, good for groups" className="w-full p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500"/>
                                </div>
                                <button type="submit" disabled={isGenerating} className="w-full bg-teal-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-teal-600 flex items-center justify-center text-lg disabled:bg-gray-400">
                                    {isGenerating ? 'Saving...' : 'Add Restaurant'}
                                </button>
                            </div>
                        </form>
                         <button onClick={() => setShowAddRestaurantModal(false)} className="mt-4 w-full text-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-semibold py-2">
                           Cancel
                        </button>
                    </div>
                </div>
            )}
            
            {showEditRestaurantModal && editingRestaurant && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-md w-full">
                        <h3 className="text-2xl font-bold mb-4 dark:text-white">Edit Restaurant</h3>
                        <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Restaurant Name</label>
                                    <input type="text" value={editingRestaurant.name} onChange={(e) => setEditingRestaurant({...editingRestaurant, name: e.target.value})} className="w-full p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-teal-500"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nickname (optional)</label>
                                    <input type="text" value={editingRestaurant.nickname} onChange={(e) => setEditingRestaurant({...editingRestaurant, nickname: e.target.value})} className="w-full p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-teal-500"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                                    <input type="text" value={editingRestaurant.address} onChange={(e) => setEditingRestaurant({...editingRestaurant, address: e.target.value})} className="w-full p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-teal-500"/>
                                </div>
                                <div className="p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Current AI Description:</p>
                                    <p className="italic text-sm dark:text-gray-300">{editingRestaurant.description}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Update instruction for AI</label>
                                    <input type="text" value={editingRestaurant.updateInstruction} onChange={(e) => setEditingRestaurant({...editingRestaurant, updateInstruction: e.target.value})} placeholder="e.g., Make it sound more exciting." className="w-full p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500"/>
                                </div>
                                <button type="submit" disabled={isGenerating} className="w-full bg-teal-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-teal-600 flex items-center justify-center text-lg disabled:bg-gray-400">
                                    {isGenerating ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                         <button onClick={() => {setShowEditRestaurantModal(false); setEditingRestaurant(null);}} className="mt-4 w-full text-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-semibold py-2">
                           Cancel
                        </button>
                    </div>
                </div>
            )}

             {showGroupModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full">
                        <h3 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">{editingGroup ? 'Edit Group' : 'Add a New Group'}</h3>
                        <form onSubmit={(e) => { e.preventDefault(); handleGroupAction(); }}>
                           <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" className="w-full p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition" autoFocus/>
                           <input type="text" value={groupLocation} onChange={(e) => setGroupLocation(e.target.value)} placeholder="Default Location (e.g. Irvine, CA)" className="w-full mt-4 p-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"/>
                            <div className="flex gap-2 mt-4">
                                <button type="button" onClick={() => {setShowGroupModal(false); setEditingGroup(null);}} className="w-full text-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-semibold py-2 rounded-lg transition-colors">Cancel</button>
                                <button type="submit" className="w-full bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-600 transition-colors">{editingGroup ? 'Save' : 'Add'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
