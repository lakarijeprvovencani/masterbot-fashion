/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Modality, type Part } from '@google/genai';

// Lottie player for scanning animation
const loadLottiePlayer = () => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@dotlottie/player-component@latest/dist/dotlottie-player.mjs';
    script.type = 'module';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// Drag and Drop functionality
const setupDragAndDrop = (dropzoneId: string, fileInputId: string, onFilesDropped: (files: File[]) => void) => {
  const dropzone = document.getElementById(dropzoneId);
  if (!dropzone) {
    console.log(`Dropzone not found: ${dropzoneId}`);
    return;
  }
  console.log(`Setting up drag and drop for: ${dropzoneId}`);

  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  // Highlight drop zone when item is dragged over it
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-over'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-over'), false);
  });

  // Handle dropped files
  dropzone.addEventListener('drop', (e: DragEvent) => {
    const files = Array.from(e.dataTransfer?.files || []).filter(file => file.type.startsWith('image/'));
    if (files.length > 0) {
      onFilesDropped(files);
    }
  }, false);

  function preventDefaults(e: Event) {
    e.preventDefault();
    e.stopPropagation();
  }
};

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

type AppView = 'home' | 'try-on' | 'ai-model' | 'editor' | 'video-generator' | 'history';

interface HistoryItem {
  id: string;
  type: 'try-on' | 'ai-model';
  timestamp: number;
  result: string; // base64 image
  prompt?: string;
  userImage?: string; // for try-on
  clothingImages?: string[]; // base64 images
}

interface AppState {
  view: AppView;
  isLoading: boolean;
  error: string | null;
  userImage: { file: File | null, base64: string, mimeType: string } | null;
  clothingImage: { file: File | null, base64: string, mimeType: string } | null; // For Try-On
  clothingImages: Array<{ file: File | null, base64: string, mimeType: string }>; // For AI Model
  prompt: string;
  videoPrompt: string;
  resultImage: string | null;
  resultVideoUrl: string | null;
  loadingMessage: string;
  editPrompt: string;
  originalEditorImage: string | null;
  imageHistory: string[]; // Stack of previous image versions for undo functionality
  redoHistory: string[]; // Stack for redo functionality
  history: HistoryItem[]; // User's creation history
  activeHistoryTab: 'try-on' | 'ai-model'; // Active tab in history view
  currentHistoryId: string | null; // ID of the history item being edited
}

const state: AppState = {
  view: 'home',
  isLoading: false,
  error: null,
  userImage: null,
  clothingImage: null,
  clothingImages: [],
  prompt: '',
  videoPrompt: '',
  resultImage: null,
  resultVideoUrl: null,
  loadingMessage: 'Kreiranje magije...',
  editPrompt: '',
  originalEditorImage: null,
  imageHistory: [],
  redoHistory: [],
  history: [],
  activeHistoryTab: 'try-on',
  currentHistoryId: null,
};

const app = document.getElementById('app');
if (!app) throw new Error('App root not found');

const fileToBase64 = (file: File): Promise<{ base64: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = (error) => reject(error);
  });
};

const smartCropToSquare = (file: File): Promise<{ base64: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = () => {
      img.src = reader.result as string;
    };
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Ne mogu da kreiram canvas'));
        return;
      }
      
      const { width: originalWidth, height: originalHeight } = img;
      
      // Determine the size of the square (use the smaller dimension)
      const squareSize = Math.min(originalWidth, originalHeight);
      canvas.width = squareSize;
      canvas.height = squareSize;
      
      // Smart cropping logic - try to center on the most important part
      let sourceX = 0;
      let sourceY = 0;
      
      if (originalWidth > originalHeight) {
        // Landscape image - crop from center horizontally
        sourceX = (originalWidth - squareSize) / 2;
        sourceY = 0;
      } else if (originalHeight > originalWidth) {
        // Portrait image - crop from top-center (better for fashion/people)
        sourceX = 0;
        sourceY = Math.max(0, (originalHeight - squareSize) / 3); // Crop from upper third
      }
      
      // Draw the cropped image
      ctx.drawImage(
        img,
        sourceX, sourceY, squareSize, squareSize, // Source rectangle
        0, 0, squareSize, squareSize // Destination rectangle
      );
      
      // Convert to base64
      const dataURL = canvas.toDataURL(file.type || 'image/png');
      const base64 = dataURL.split(',')[1];
      
      console.log(`🔲 Smart cropped: ${originalWidth}x${originalHeight} → ${squareSize}x${squareSize}`);
      
      resolve({ base64, mimeType: file.type || 'image/png' });
    };
    
    img.onerror = () => reject(new Error('Ne mogu da učitam sliku'));
    reader.onerror = () => reject(new Error('Ne mogu da pročitam fajl'));
    reader.readAsDataURL(file);
  });
};

const cropAndDownloadImage = (imageUrl: string, targetAspectRatio: number, fileName: string): void => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;
        const originalAspectRatio = originalWidth / originalHeight;

        let sx = 0, sy = 0, sWidth = originalWidth, sHeight = originalHeight;

        if (targetAspectRatio < originalAspectRatio) {
            // Target is taller/thinner than original -> crop sides
            sWidth = originalHeight * targetAspectRatio;
            sx = (originalWidth - sWidth) / 2;
        } else if (targetAspectRatio > originalAspectRatio) {
            // Target is wider/shorter than original -> crop top/bottom
            sHeight = originalWidth / targetAspectRatio;
            sy = (originalHeight - sHeight) / 2;
        }

        const canvas = document.createElement('canvas');
        canvas.width = sWidth;
        canvas.height = sHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setState({ error: 'Greška pri kreiranju canvasa za isecanje slike.'});
            return;
        };

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    img.onerror = () => {
       setState({ error: 'Nije moguće učitati sliku za isecanje.'});
    };
};

const setState = (newState: Partial<AppState>) => {
  Object.assign(state, newState);
  render();
};

const showScanningPopup = async (clothingImages: Array<{ base64: string, mimeType: string }>) => {
  // Create scanning popup overlay
  const overlay = document.createElement('div');
  overlay.id = 'scanning-popup';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(10px);
  `;

  const container = document.createElement('div');
  container.style.cssText = `
    position: relative;
    width: 400px;
    height: 400px;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
  `;

  // Background with images (supports 1 or 2 images)
  const background = document.createElement('div');
  background.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(45deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  if (clothingImages.length > 0) {
    const first = document.createElement('img');
    first.src = `data:${clothingImages[0].mimeType};base64,${clothingImages[0].base64}`;
    first.style.cssText = `
      position: absolute;
      width: 65%;
      height: 65%;
      object-fit: cover;
      border-radius: 15px;
      opacity: 0.25;
      transform: rotate(-6deg);
      top: 10%;
      left: 8%;
    `;
    background.appendChild(first);
  }
  if (clothingImages.length > 1) {
    const second = document.createElement('img');
    second.src = `data:${clothingImages[1].mimeType};base64,${clothingImages[1].base64}`;
    second.style.cssText = `
      position: absolute;
      width: 65%;
      height: 65%;
      object-fit: cover;
      border-radius: 15px;
      opacity: 0.25;
      transform: rotate(6deg);
      bottom: 10%;
      right: 8%;
    `;
    background.appendChild(second);
  }

  // Animation container - centered
  const animationContainer = document.createElement('div');
  animationContainer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
  `;

  // Load and create dotlottie player
  try {
    await loadLottiePlayer();
    
    const player = document.createElement('dotlottie-player');
    player.setAttribute('src', '/assets/X6eLd46GUG.lottie');
    player.setAttribute('background', 'transparent');
    player.setAttribute('speed', '1');
    player.setAttribute('loop', '');
    player.setAttribute('autoplay', '');
    player.style.cssText = `
      width: 300px;
      height: 300px;
    `;
    
    animationContainer.appendChild(player);
  } catch (error) {
    // Fallback to CSS spinner if Lottie fails
    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 60px;
      height: 60px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top: 4px solid #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    `;
    animationContainer.appendChild(spinner);
  }



  // Status text at the bottom - moved lower
  const statusText = document.createElement('div');
  statusText.id = 'scanning-status';
  statusText.style.cssText = `
    position: absolute;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    color: white;
    font-size: 18px;
    font-weight: 600;
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    text-align: center;
  `;
  statusText.textContent = 'Masterbot skenira garderobu...';

  container.appendChild(background);
  container.appendChild(animationContainer);
  container.appendChild(statusText);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  return {
    updateStatus: (text: string) => {
      const status = document.getElementById('scanning-status');
      if (status) status.textContent = text;
    },
    close: () => {
      const popup = document.getElementById('scanning-popup');
      if (popup) popup.remove();
    }
  };
};

// Add CSS animation for fallback spinner
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

const resetAIModelState = () => {
    setState({
        error: null,
        clothingImages: [],
        prompt: '',
        videoPrompt: '',
        resultImage: null,
        resultVideoUrl: null,
        originalEditorImage: null,
        editPrompt: '',
        imageHistory: [],
        currentHistoryId: null,
    });
};

const handleFileChange = async (event: Event, key: 'userImage' | 'clothingImage') => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    try {
      setState({ isLoading: true, loadingMessage: 'Pametno isecanje slike na kvadrat...' });
      // Use smart cropping for both user and clothing images in try-on
      const { base64, mimeType } = await smartCropToSquare(file);
      setState({ [key]: { file, base64, mimeType }, error: null, isLoading: false });
    } catch (err) {
      setState({ error: 'Greška pri obradi slike. Pokušajte sa drugim formatom.', isLoading: false });
    }
  }
};

const MAX_CLOTHING_IMAGES = 5;
const handleClothingFilesChange = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files) {
        if (state.clothingImages.length + files.length > MAX_CLOTHING_IMAGES) {
            setState({ error: `Možete dodati najviše ${MAX_CLOTHING_IMAGES} slika.` });
            input.value = ''; // Reset input
            return;
        }
        setState({ isLoading: true, loadingMessage: 'Pametno isecanje slika na kvadrat...' });
        try {
            const newImages = await Promise.all(
                Array.from(files).map(async (file) => {
                    // Use smart cropping for clothing images
                    const { base64, mimeType } = await smartCropToSquare(file);
                    return { file, base64, mimeType };
                })
            );
            setState({
                clothingImages: [...state.clothingImages, ...newImages],
                error: null
            });
        } catch (err) {
            setState({ error: 'Greška pri obradi slika. Pokušajte sa drugim formatom.' });
        } finally {
            input.value = ''; // Reset input to allow re-uploading the same file
            setState({ isLoading: false, loadingMessage: 'Kreiranje magije...' });
        }
    }
};

const removeClothingImage = (indexToRemove: number) => {
    const updatedImages = state.clothingImages.filter((_, index) => index !== indexToRemove);
    setState({ clothingImages: updatedImages });
};


const getFriendlyErrorMessage = (error: unknown): string => {
    // Always return the same standardized Masterbot error message
    // Log the original error for debugging but don't expose it to users
    console.error("Originalna greška:", error);
    return 'Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.';
};

// History management functions
const loadHistoryFromStorage = (): HistoryItem[] => {
    try {
        const stored = localStorage.getItem('masterbot-history');
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('Error loading history:', error);
        return [];
    }
};

const saveHistoryToStorage = (history: HistoryItem[]) => {
    try {
        localStorage.setItem('masterbot-history', JSON.stringify(history));
    } catch (error) {
        console.error('Error saving history:', error);
        if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
            console.warn('LocalStorage quota exceeded. Trimming history...');
            // Try to trim oldest items until it fits
            let trimmed = [...history];
            let saved = false;
            while (!saved && trimmed.length > 0) {
                trimmed = trimmed.slice(0, trimmed.length - 1);
                try {
                    localStorage.setItem('masterbot-history', JSON.stringify(trimmed));
                    saved = true;
                } catch (innerError) {
                    // keep trimming
                }
            }
            // Reflect the actually saved history in state if we trimmed
            if (trimmed.length !== history.length) {
                setState({ history: trimmed });
            }
        }
    }
};

const addToHistory = (item: Omit<HistoryItem, 'id' | 'timestamp'>): HistoryItem => {
    const historyItem: HistoryItem = {
        ...item,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: Date.now()
    };
    
    const newHistory = [historyItem, ...state.history].slice(0, 50); // Keep only last 50 items
    setState({ history: newHistory });
    saveHistoryToStorage(newHistory);
    return historyItem;
};

const updateHistoryItem = (id: string, updates: Partial<Omit<HistoryItem, 'id'>>) => {
    const newHistory = state.history.map(item => {
        if (item.id === id) {
            // Create a new object with updated fields and a new timestamp
            return { ...item, ...updates, timestamp: Date.now() };
        }
        return item;
    }).sort((a, b) => b.timestamp - a.timestamp); // Re-sort to bring the updated item to the top

    // Check if the history has actually changed to avoid unnecessary re-renders
    if (JSON.stringify(newHistory) !== JSON.stringify(state.history)) {
        setState({ history: newHistory });
        saveHistoryToStorage(newHistory);
    }
};

const removeFromHistory = (id: string) => {
    const newHistory = state.history.filter(item => item.id !== id);
    setState({ history: newHistory });
    saveHistoryToStorage(newHistory);
};


const generateVirtualTryOn = async () => {
  if (!state.userImage || !state.clothingImage) {
    setState({ error: 'Molimo vas odaberite obe slike.' });
    return;
  }
  
  // Use branded scanning popup (user + clothing images)
  const imagesForPopup = [
    { base64: state.userImage.base64, mimeType: state.userImage.mimeType },
    { base64: state.clothingImage.base64, mimeType: state.clothingImage.mimeType }
  ];
  const scanningPopup = await showScanningPopup(imagesForPopup);
  setState({ error: null, resultImage: null, resultVideoUrl: null });

  try {
    scanningPopup.updateStatus('Masterbot analizira fotografiju...');

    const userImagePart = { inlineData: { data: state.userImage.base64, mimeType: state.userImage.mimeType } };
    const clothingImagePart = { inlineData: { data: state.clothingImage.base64, mimeType: state.clothingImage.mimeType } };
    const systemInstruction = 'IMPORTANT: Do not add, remove, or modify any clothing items, logos, text, patterns, or details on the clothing. Keep all garments exactly as shown in the provided images. Do not add brand logos, text overlays, or any decorative elements that are not already present. Preserve the original design, colors, and details of each clothing item precisely.';
    const textPart = { text: `Take the clothing from the second image and realistically place it onto the person in the first image. The final image should only show the person wearing the new clothing in the original setting. ${systemInstruction}` };

    // Small delay for better UX
    await new Promise(resolve => setTimeout(resolve, 800));
    scanningPopup.updateStatus('Masterbot kreira model...');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts: [userImagePart, clothingImagePart, textPart] },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        imageConfig: {
          aspectRatio: '1:1', // Force square format
          numberOfImages: 1
        }
      },
    });
    
    scanningPopup.updateStatus('Sve spremno! 🎉');

    const imagePart = response.candidates?.[0]?.content?.parts.find(part => part.inlineData);
    if (imagePart?.inlineData) {
      const base64Image = imagePart.inlineData.data;
      const resultImageData = `data:image/png;base64,${base64Image}`;

      // Close popup slightly later to feel smoother
      setTimeout(() => {
        scanningPopup.close();
        setState({ resultImage: resultImageData });
        
        // Save to history (lightweight)
        addToHistory({
          type: 'try-on',
          result: resultImageData
        });
      }, 1200);
    } else {
      scanningPopup.close();
      throw new Error('Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.');
    }
  } catch (err) {
      scanningPopup.close();
      setState({ error: getFriendlyErrorMessage(err) });
  }
};


const generateAIModel = async () => {
    if (!state.clothingImages.length || !state.prompt) {
        setState({ error: 'Molimo vas odaberite sliku odeće i unesite opis.' });
        return;
    }
    
    // Show scanning popup instead of regular loading
    const scanningPopup = await showScanningPopup(state.clothingImages);
    setState({ error: null, resultImage: null, resultVideoUrl: null });

    try {
        scanningPopup.updateStatus('Masterbot analizira fotografiju...');
        
        const clothingImageParts = state.clothingImages.map(img => ({
            inlineData: { data: img.base64, mimeType: img.mimeType }
        }));
        
        const clothingPreservationInstruction = `Važno: Fokusiraj se isključivo na generisanje modela prema opisu. Odeća i aksesoari sa dodatih slika moraju ostati POTPUNO ISTI, bez ikakvih izmena na detaljima, logotipima, teksturama ili bojama. Ne dodaji i ne uklanjaj ništa sa garderobe.`;
        
        const systemInstructionText = `Ti si AI asistent za modni dizajn. Tvoj zadatak je da kreiraš fotorealističnog AI modela na osnovu opisa korisnika i slika odeće koje su date. Model mora uvek biti evropskog porekla (caucasian/european ethnicity). ${clothingPreservationInstruction}`;
        
        const textPart = { text: state.prompt };

        // Add delay for better UX
        await new Promise(resolve => setTimeout(resolve, 1500));
        scanningPopup.updateStatus('Masterbot kreira model...');

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            system: { parts: [{ text: systemInstructionText }] },
            contents: { parts: [...clothingImageParts, textPart] },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
                imageConfig: {
                    aspectRatio: '1:1', // Force square format
                    numberOfImages: 1
                }
            },
        });

        scanningPopup.updateStatus('Sve spremno! 🎉');

        const imagePart = response.candidates?.[0]?.content?.parts.find(part => part.inlineData);
        if (imagePart?.inlineData) {
            const base64Image = imagePart.inlineData.data;
            
            // Show completion message longer
            setTimeout(() => {
                scanningPopup.close();
                const resultImageData = `data:image/png;base64,${base64Image}`;
                
                // Save to history and get the new item
                const newHistoryItem = addToHistory({
                    type: 'ai-model',
                    result: resultImageData,
                    prompt: state.prompt,
                    clothingImages: state.clothingImages.map(img => `data:${img.mimeType};base64,${img.base64}`)
                });
                
                setState({ 
                    resultImage: resultImageData,
                    currentHistoryId: newHistoryItem.id // Store the ID
                });
            }, 1500);
        } else {
            scanningPopup.close();
            throw new Error('Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.');
        }

    } catch (err) {
        scanningPopup.close();
        setState({ view: 'ai-model', error: getFriendlyErrorMessage(err) });
    }
};

const undoEdit = () => {
    if (state.imageHistory.length > 0) {
        const newRedoHistory = [...state.redoHistory];
        if (state.resultImage) {
            newRedoHistory.push(state.resultImage);
        }
        
        const newHistory = [...state.imageHistory];
        const previousImage = newHistory.pop()!;
        
        setState({
            resultImage: previousImage,
            imageHistory: newHistory,
            redoHistory: newRedoHistory,
            error: null
        });
    }
};

const redoEdit = () => {
    if (state.redoHistory.length > 0) {
        const newHistory = [...state.imageHistory];
        if (state.resultImage) {
            newHistory.push(state.resultImage);
        }
        
        const newRedoHistory = [...state.redoHistory];
        const nextImage = newRedoHistory.pop()!;
        
        setState({
            resultImage: nextImage,
            imageHistory: newHistory,
            redoHistory: newRedoHistory,
            error: null
        });
    }
};

const editImage = async () => {
    if (!state.resultImage || !state.editPrompt) {
        setState({ error: 'Molimo vas unesite opis izmene.' });
        return;
    }
    setState({ error: null, isLoading: true });

    try {
        // Save current image to history before applying new edit
        const currentHistory = [...state.imageHistory];
        if (state.resultImage) {
            currentHistory.push(state.resultImage);
        }
        
        // Clear redo history when making a new edit
        const clearedRedoHistory: string[] = [];

        const base64Data = state.resultImage.split(',')[1];
        const imagePart = { inlineData: { data: base64Data, mimeType: 'image/png' } };
        const clothingPreservationInstruction = 'IMPORTANT: When making edits, do not add, remove, or modify any existing clothing items, logos, text, patterns, or details on the clothing. Preserve all garments exactly as they are. Only modify what is specifically requested in the prompt.';
        const textPart = { text: `${state.editPrompt} ${clothingPreservationInstruction}` };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
                imageConfig: {
                    aspectRatio: '1:1', // Force square format
                    numberOfImages: 1
                }
            },
        });

        const newImagePart = response.candidates?.[0]?.content?.parts.find(part => part.inlineData);
        if (newImagePart?.inlineData) {
            const base64Image = newImagePart.inlineData.data;
            const newResultImage = `data:image/png;base64,${base64Image}`;
            
            // Update the history item if there is one
            if (state.currentHistoryId) {
                updateHistoryItem(state.currentHistoryId, { result: newResultImage });
            }

            setState({ 
                resultImage: newResultImage, 
                editPrompt: '',
                imageHistory: currentHistory,
                redoHistory: clearedRedoHistory
            });
        } else {
            throw new Error('Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.');
        }
    } catch (err) {
        setState({ error: getFriendlyErrorMessage(err) });
    } finally {
        setState({ isLoading: false });
    }
};

const generateVideo = async () => {
    if (!state.resultImage || !state.videoPrompt) {
        setState({ error: 'Molimo vas unesite opis za animaciju.' });
        return;
    }
    setState({ error: null, isLoading: true, resultVideoUrl: null, loadingMessage: 'Masterbot postavlja scenu...' });
    
    const loadingMessages = [
        "Kamere se pale...",
        "Akcija! Generisanje videa...",
        "Finalni kadrovi... Ovo može potrajati nekoliko minuta.",
        "Renderovanje specijalnih efekata...",
    ];
    let messageIndex = 0;
    const messageInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        setState({ loadingMessage: loadingMessages[messageIndex] });
    }, 15000);

    try {
        console.log('🎬 Starting video generation...');
        console.log('📝 Video prompt:', state.videoPrompt);
        console.log('🔑 API Key available:', process.env.API_KEY ? 'YES' : 'NO');
        
        if (!process.env.API_KEY) {
            throw new Error('Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.');
        }
        
        const base64Data = state.resultImage.split(',')[1];
        console.log('🖼️ Image data length:', base64Data.length);
        
        console.log('🚀 Calling Veo 2.0 API...');
        // Simplified and shorter clothing preservation instruction
        const clothingPreservationPrompt = 'Keep clothing exactly as shown in image. No changes to garments.';
        const fullVideoPrompt = `${state.videoPrompt}. ${clothingPreservationPrompt}`;
        
        let operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: fullVideoPrompt,
            image: {
                imageBytes: base64Data,
                mimeType: 'image/png',
            },
            config: {
                numberOfVideos: 1
            }
        });

        console.log('⏳ Initial operation response:', operation);

        let attempts = 0;
        const maxAttempts = 60; // 10 minutes max
        
        while (!operation.done && attempts < maxAttempts) {
            attempts++;
            console.log(`⏰ Waiting for video generation... (attempt ${attempts}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            try {
                operation = await ai.operations.getVideosOperation({ operation: operation });
                console.log(`📊 Operation status:`, operation.done ? 'COMPLETED' : 'IN PROGRESS');
            } catch (pollError) {
                console.error('❌ Error polling operation:', pollError);
                throw new Error('Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.');
            }
        }

        if (attempts >= maxAttempts) {
            throw new Error('Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.');
        }

        if (operation.error) {
            console.error('❌ Operation failed with error:', operation.error);
            throw new Error('Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.');
        }

        console.log('✅ Video generation completed!');
        console.log('📋 Full operation response:', JSON.stringify(operation, null, 2));
        console.log('🔍 Response structure:', operation.response);
        console.log('🔍 Generated videos:', operation.response?.generatedVideos);

        // Try different possible response structures for Veo 2.0
        let downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri ||
                          operation.response?.videos?.[0]?.uri ||
                          operation.response?.results?.[0]?.video?.uri ||
                          operation.response?.output?.video?.uri ||
                          operation.result?.videos?.[0]?.uri;
        
        console.log('🔗 Download link:', downloadLink);
        
        // If still no link, try to get it from the operation itself
        if (!downloadLink && operation.response?.generatedVideos?.[0]) {
            const video = operation.response.generatedVideos[0];
            downloadLink = video.downloadUrl || video.url || video.videoUrl || video.uri;
        }
        
        // Debug: Check alternative response structures
        if (!downloadLink) {
            console.log('❓ Checking all possible response structures...');
            console.log('🔍 operation.response:', operation.response);
            console.log('🔍 operation.result:', operation.result);
            console.log('🔍 operation.data:', operation.data);
            console.log('🔍 Full operation keys:', Object.keys(operation));
            if (operation.response) {
                console.log('🔍 Response keys:', Object.keys(operation.response));
            }
        }
        
        if (downloadLink) {
            console.log('📥 Downloading video...');
            
            try {
                // Try with API key first
                let response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                console.log('📊 Download response status:', response.status, response.statusText);
                
                // If failed, try without API key parameter
                if (!response.ok) {
                    console.log('🔄 Retrying download without API key parameter...');
                    response = await fetch(downloadLink);
                    console.log('📊 Retry response status:', response.status, response.statusText);
                }
                
                if (!response.ok) {
                    throw new Error('Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.');
                }
                
                const blob = await response.blob();
                console.log('📦 Video blob size:', blob.size, 'bytes');
                console.log('📦 Video blob type:', blob.type);
                
                if (blob.size === 0) {
                    throw new Error('Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.');
                }
                
                const videoUrl = URL.createObjectURL(blob);
                console.log('🎥 Video URL created:', videoUrl);
                
                setState({ resultVideoUrl: videoUrl });
            } catch (downloadError) {
                console.error('❌ Download failed:', downloadError);
                throw new Error('Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.');
            }
        } else {
            console.error('❌ No download link in response');
            throw new Error('Masterbot nije uspeo realizaciju. Molimo pokušajte ponovo ili unesite precizniji opis.');
        }

    } catch (err) {
        console.error('💥 Video generation error:', err);
        console.error('💥 Error stack:', err.stack);
        setState({ error: getFriendlyErrorMessage(err) });
    } finally {
        clearInterval(messageInterval);
        setState({ isLoading: false, loadingMessage: 'Kreiranje magije...' });
    }
};

const renderDownloadDropdown = (fileNameBase: string) => {
    if (!state.resultImage) return '';
    return `
    <div class="dropdown">
        <button class="btn btn-primary dropdown-toggle">
            Preuzmi
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" /></svg>
        </button>
        <div class="dropdown-menu">
            <a href="${state.resultImage}" download="${fileNameBase}-original.png" class="dropdown-item">Original</a>
            <button class="dropdown-item" data-aspect="9:16" data-filenamebase="${fileNameBase}">Story (9:16)</button>
            <button class="dropdown-item" data-aspect="4:5" data-filenamebase="${fileNameBase}">Post (4:5)</button>
        </div>
    </div>
    `;
};


const setupDownloadListeners = () => {
    const dropdownToggle = document.querySelector('.dropdown-toggle');
    const dropdown = dropdownToggle?.parentElement;
    
    dropdownToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown?.classList.toggle('active');
    });

    document.querySelectorAll('.dropdown-item[data-aspect]').forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.currentTarget as HTMLElement;
            const aspectRatioString = target.dataset.aspect;
            const fileNameBase = target.dataset.filenamebase;

            if (state.resultImage && aspectRatioString && fileNameBase) {
                const [width, height] = aspectRatioString.split(':').map(Number);
                const aspectRatio = width / height;
                cropAndDownloadImage(
                    state.resultImage,
                    aspectRatio,
                    `${fileNameBase}-${aspectRatioString.replace(':', 'x')}.png`
                );
                dropdown?.classList.remove('active');
            }
        });
    });

    // Close dropdown on click outside
    document.addEventListener('click', (event) => {
        if (dropdown && !dropdown.contains(event.target as Node)) {
            dropdown.classList.remove('active');
        }
    });
};

const renderHomeScreen = () => {
  app.innerHTML = `
    <div class="home-container">
      <h1>Masterbot Fashion</h1>
      <p class="subtitle">Tvoja AI modna inspiracija</p>
      <div class="card-container">
        <div class="card" id="go-to-try-on">
             <img src="/assets/ikonicasredjena.png" alt="Virtuelno Probaj ikonica" class="card-main-icon">
            <h3>Virtuelno Probaj</h3>
            <p>Postavi svoju sliku i sliku odeće da vidiš kako ti stoji.</p>
        </div>
        <div class="card" id="go-to-ai-model">
            <svg xmlns="http://www.w3.org/2000/svg" class="card-main-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C9.24 2 7 4.24 7 7s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM12 10c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zM20.59 12.06l-1.42 1.42C18.98 13.68 18.74 14 18.45 14H5.55c-.29 0-.53-.32-.72-.51l-1.42-1.42C3.02 11.67 3 11.14 3.3 10.85l1.42-1.42C4.91 9.24 5.2 9 5.5 9h13c.3 0 .59.24.78.43l1.42 1.42c.3.29.31.82.09 1.21zM5.5 16h13c.28 0 .5.22.5.5v3c0 .28-.22.5-.5.5h-13c-.28 0-.5-.22-.5-.5v-3c0-.28.22-.5.5-.5z"/>
            </svg>
            <h3>Generiši AI Modela</h3>
            <p>Kreiraj jedinstvenog AI modela sa odećom po izboru.</p>
        </div>
        
        <div class="card" id="go-to-history">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 8H12V13L16.28 15.54L17 14.33L13.5 12.25V8ZM13 3C8.03 3 4 7.03 4 12H1L4.89 15.89L4.96 16.03L9 12H6C6 8.13 9.13 5 13 5S20 8.13 20 12S16.87 19 13 19C11.07 19 9.32 18.21 8.06 16.94L6.64 18.36C8.27 20 10.5 21 13 21C18.97 21 23 16.97 23 11C23 5.03 18.97 1 13 3Z"/></svg>
            <h3>Moje Kreacije</h3>
            <p>Pogledaj svoje prethodne kreacije i rezultate.</p>
        </div>
      </div>
    </div>`;
  document.getElementById('go-to-try-on')?.addEventListener('click', () => setState({ view: 'try-on', error: null, userImage: null, clothingImage: null, prompt: '', resultImage: null, resultVideoUrl: null }));
  document.getElementById('go-to-ai-model')?.addEventListener('click', () => {
    setState({ view: 'ai-model' });
    resetAIModelState();
  });
  document.getElementById('go-to-history')?.addEventListener('click', () => setState({ view: 'history' }));
};

const renderTryOnScreen = () => {
    const userImagePreview = state.userImage ? `data:${state.userImage.mimeType};base64,${state.userImage.base64}` : '';
    const clothingImagePreview = state.clothingImage ? `data:${state.clothingImage.mimeType};base64,${state.clothingImage.base64}` : '';

    app.innerHTML = `
    <div class="split-container">
      <div class="control-panel">
        <button class="btn-back" id="back-btn">&larr; Nazad na početnu</button>
        <div class="panel-header">
            <h2>Virtuelno Probaj</h2>
            <p>Dodajte vašu fotografiju i odeću koju želite da probate.</p>
        </div>
        
        <div class="info-section" style="background: #f8f9fa; border-radius: 12px; padding: 16px; margin-bottom: 20px; display: flex; align-items: center; gap: 15px; border: 1px solid #e9ecef;">
            <img src="/assets/fashionsiluetea.png" alt="Fashion silhouette" style="width: 60px; height: 120px; object-fit: contain; flex-shrink: 0;">
            <div style="flex: 1;">
                <h4 style="margin: 0 0 6px 0; color: #2c3e50; font-size: 14px; font-weight: 600;">💡 Savet za najbolji rezultat</h4>
                <p style="margin: 0; color: #5a6c7d; font-size: 13px; line-height: 1.4;">Najbolji rezultat generisanja se dobija ako je slika modela u donjem vešu.</p>
            </div>
        </div>
        
        <div class="input-group">
            <label for="user-image" class="file-input-label ${userImagePreview ? 'has-image' : ''}" id="user-image-dropzone">
                ${userImagePreview 
                    ? `<img src="${userImagePreview}" class="image-preview" alt="Pregled korisnika">` 
                    : '<div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM20.944 20.004a.5.5 0 0 0-.447-.5h-17a.5.5 0 0 0-.447.5 10 10 0 0 0 17.894 0Z"/></svg><span>Dodaj svoju fotografiju<br><small style="opacity: 0.7;">ili prevuci sliku ovde</small></span></div>'
                }
                <input type="file" id="user-image" accept="image/*">
            </label>
        </div>

        <div class="input-group">
            <label for="clothing-image" class="file-input-label ${clothingImagePreview ? 'has-image' : ''}" id="clothing-image-dropzone">
                 ${clothingImagePreview 
                    ? `<img src="${clothingImagePreview}" class="image-preview" alt="Pregled odeće">` 
                    : '<div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="40" height="40"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.45a1 1 0 0 0 .94.86h13.4c.56 0 1.03-.44 1.08-.99l.58-3.45a2 2 0 0 0-1.34-2.23z"></path><path d="M4 10h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10z"></path></svg><span>Dodaj fotografiju odeće<br><small style="opacity: 0.7;">ili prevuci sliku ovde</small></span></div>'}
                <input type="file" id="clothing-image" accept="image/*">
            </label>
        </div>
        
        ${state.error ? `<div class="error-message">${state.error}</div>` : ''}
        <button class="btn btn-primary" id="generate-try-on" ${!state.userImage || !state.clothingImage ? 'disabled' : ''}>Kreiraj</button>
      </div>
      <div class="result-panel">
        ${
            state.isLoading 
            ? `<div class="loader-container"><div class="spinner"></div><p>Masterbot radi na detaljima...</p></div>`
            : state.resultImage 
            ? `
                <div class="result-container">
                    <img src="${state.resultImage}" alt="Generisana slika" class="result-image"/>
                    <div class="button-group">
                        ${renderDownloadDropdown('masterbot-tryon')}
                        <button class="btn btn-secondary" id="try-again">Obuci novu kombinaciju</button>
                    </div>
                </div>`
            : `<p>Vaš rezultat će se pojaviti ovde.</p><p class="generation-time">Vreme potrebno za generisanje slike je 15-45 sekundi.</p>`
        }
      </div>
    </div>
    
    <div class="disclaimer">
      <p><strong>💎 Masterbot AI Fashion</strong> vodi računa o detaljima i na to smo izuzetno ponosni.<br>
      Ipak, veštačka inteligencija može ponekad da pogreši – <em>slobodno pokušajte ponovo sa jasnijom fotografijom</em> da biste dobili bolji rezultat.</p>
    </div>`;

    document.getElementById('back-btn')?.addEventListener('click', () => setState({ view: 'home' }));
    document.getElementById('user-image')?.addEventListener('change', (e) => handleFileChange(e, 'userImage'));
    document.getElementById('clothing-image')?.addEventListener('change', (e) => handleFileChange(e, 'clothingImage'));
    document.getElementById('generate-try-on')?.addEventListener('click', generateVirtualTryOn);
    document.getElementById('try-again')?.addEventListener('click', () => setState({ resultImage: null, error: null }));
    if(state.resultImage) setupDownloadListeners();
    
    // Setup drag and drop for Virtual Try-On
    setupDragAndDrop('user-image-dropzone', 'user-image', (files) => {
      if (files[0]) {
        const input = document.getElementById('user-image') as HTMLInputElement;
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        input.files = dt.files;
        handleFileChange({ target: input } as any, 'userImage');
      }
    });
    
    setupDragAndDrop('clothing-image-dropzone', 'clothing-image', (files) => {
      if (files[0]) {
        const input = document.getElementById('clothing-image') as HTMLInputElement;
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        input.files = dt.files;
        handleFileChange({ target: input } as any, 'clothingImage');
      }
    });
};

const renderAIModelScreen = () => {
    let resultPanelContent = '';
    if (state.isLoading) {
        resultPanelContent = `<div class="loader-container"><div class="spinner"></div><p>${state.loadingMessage}</p></div>`;
    } else if (state.resultImage) {
        resultPanelContent = `
            <div class="result-container">
                <img src="${state.resultImage}" alt="Generisana slika" class="result-image"/>
                <div class="button-group">
                    <button class="btn btn-secondary" id="edit-image">Edituj Sliku</button>
                    <button class="btn btn-secondary" id="create-video" style="display: none;">Kreiraj Video</button>
                    ${renderDownloadDropdown('masterbot-fashion')}
                </div>
                 <button class="btn btn-tertiary" id="try-again">Obuci novu kombinaciju</button>
            </div>`;
    } else {
        resultPanelContent = `<p>Vaš generisani model će se pojaviti ovde.</p><p class="generation-time">Vreme potrebno za generisanje slike je 15-45 sekundi.</p>`;
    }

    app.innerHTML = `
    <div class="split-container">
      <div class="control-panel">
        <button class="btn-back" id="back-btn">&larr; Nazad na početnu</button>
        <div class="panel-header">
            <h2>Generiši AI modela</h2>
            <p>Dodajte odeću, akcesoare i druge elemente i opišite modela koga želite da vidite.</p>
        </div>
        
        <div class="input-group" id="ai-clothing-input-group">
            <label for="ai-model-clothing-image">Odeća (do ${MAX_CLOTHING_IMAGES} slika)</label>
            <div class="image-preview-grid" id="ai-clothing-dropzone">
                ${state.clothingImages.map((img, index) => `
                    <div class="preview-item">
                        <img src="data:${img.mimeType};base64,${img.base64}" alt="Pregled odeće ${index + 1}">
                        <button class="remove-btn" data-index="${index}" aria-label="Ukloni sliku ${index + 1}">&times;</button>
                    </div>
                `).join('')}
            </div>
            ${state.clothingImages.length < MAX_CLOTHING_IMAGES ? `
                <label for="ai-model-clothing-image" class="btn btn-secondary upload-btn" id="ai-clothing-upload-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6Z"/></svg>
                    <span>${state.clothingImages.length > 0 ? 'Dodaj još' : 'Dodaj fotografije'}<br><small style="opacity: 0.7;">ili prevuci slike ovde</small></span>
                </label>
                <input type="file" id="ai-model-clothing-image" accept="image/*" multiple style="display: none;">
            ` : ''}
        </div>

        <div class="input-group">
            <label for="prompt">Opišite modela</label>
            <textarea id="prompt" placeholder="Npr: Mlad muškarac, 35 godina, stoji na ulicama Pariza noću, nosi ovu košulju.">${state.prompt}</textarea>
        </div>

        ${state.error ? `<div class="error-message">${state.error}</div>` : ''}
        <button class="btn btn-primary" id="generate-ai-model" ${state.clothingImages.length === 0 || !state.prompt ? 'disabled' : ''}>Generiši Sliku</button>
      </div>
      <div class="result-panel">
        ${resultPanelContent}
      </div>
    </div>
    
    <div class="disclaimer">
      <p><strong>💎 Masterbot AI Fashion</strong> vodi računa o detaljima i na to smo izuzetno ponosni.<br>
      Ipak, veštačka inteligencija može ponekad da pogreši – <em>slobodno pokušajte ponovo sa jasnijim opisom</em> da biste dobili bolji rezultat.</p>
    </div>`;

    document.getElementById('back-btn')?.addEventListener('click', () => setState({ view: 'home' }));
    document.getElementById('ai-model-clothing-image')?.addEventListener('change', handleClothingFilesChange);
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt((e.currentTarget as HTMLElement).dataset.index ?? '0', 10);
            removeClothingImage(index);
        });
    });
    document.getElementById('prompt')?.addEventListener('input', (e) => {
        state.prompt = (e.target as HTMLTextAreaElement).value;
        const button = document.getElementById('generate-ai-model') as HTMLButtonElement;
        if(button) {
            button.disabled = state.clothingImages.length === 0 || !state.prompt;
        }
    });
    
    document.getElementById('generate-ai-model')?.addEventListener('click', generateAIModel);
    document.getElementById('try-again')?.addEventListener('click', resetAIModelState);
    document.getElementById('edit-image')?.addEventListener('click', () => setState({ view: 'editor', originalEditorImage: state.resultImage, editPrompt: '', error: null, imageHistory: [], redoHistory: [] }));
    document.getElementById('create-video')?.addEventListener('click', () => setState({ view: 'video-generator', error: null, resultVideoUrl: null, videoPrompt: '' }));
    if(state.resultImage) setupDownloadListeners();
    
    // Setup drag and drop for AI Model clothing images - multiple zones
    const aiDropHandler = (files: File[]) => {
      const input = document.getElementById('ai-model-clothing-image') as HTMLInputElement;
      const dt = new DataTransfer();
      files.forEach(file => dt.items.add(file));
      input.files = dt.files;
      handleClothingFilesChange({ target: input } as any);
    };
    
    // Try multiple dropzones for better coverage
    setupDragAndDrop('ai-clothing-input-group', 'ai-model-clothing-image', aiDropHandler);
    setupDragAndDrop('ai-clothing-dropzone', 'ai-model-clothing-image', aiDropHandler);
    setupDragAndDrop('ai-clothing-upload-btn', 'ai-model-clothing-image', aiDropHandler);
};

const renderEditorScreen = () => {
    app.innerHTML = `
    <div class="split-container">
      <div class="control-panel">
        <button class="btn-back" id="back-to-result-btn">&larr; Nazad na rezultat</button>
        <div class="panel-header">
            <h2>Editor Slike</h2>
            <p>Opišite kako želite da izmenite sliku.</p>
        </div>
        
        <div class="input-group">
            <label>Original</label>
            <img src="${state.originalEditorImage}" alt="Originalna slika" class="image-preview-small"/>
        </div>

        <div class="input-group">
            <label for="edit-prompt">Opišite izmenu</label>
            <textarea id="edit-prompt" placeholder="Npr: Promeni pozadinu u plažu, dodaj šešir... (Garderoba se neće menjati)">${state.editPrompt}</textarea>
        </div>
        
        ${state.error ? `<div class="error-message">${state.error}</div>` : ''}
        <button class="btn btn-primary" id="generate-edit-btn" ${!state.editPrompt ? 'disabled' : ''}>Primeni izmenu</button>
      </div>
      <div class="result-panel">
        ${
            state.isLoading 
            ? `<div class="loader-container"><div class="spinner"></div><p>Masterbot sredjuje sliku...</p></div>`
            : state.resultImage
            ? `
                <div class="result-container">
                    <img src="${state.resultImage}" alt="Izmenjena slika" class="result-image"/>
                    <div class="undo-redo-group">
                        ${state.imageHistory.length > 0 ? `
                            <button class="btn btn-secondary" id="undo-edit-btn">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                    <path d="M7.82843 10.9999H20V12.9999H7.82843L13.1924 18.3638L11.7782 19.778L4 11.9999L11.7782 4.22168L13.1924 5.63589L7.82843 10.9999Z"/>
                                </svg>
                                Poništi izmenu
                            </button>
                        ` : ''}
                        ${state.redoHistory.length > 0 ? `
                            <button class="btn btn-secondary" id="redo-edit-btn">
                                Vrati izmenu
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                    <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z"/>
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                    <div class="download-section">
                        ${renderDownloadDropdown('masterbot-fashion-edit')}
                    </div>
                </div>`
            : `<p>Vaša izmenjena slika će se pojaviti ovde.</p>`
        }
      </div>
    </div>`;

    document.getElementById('back-to-result-btn')?.addEventListener('click', () => setState({ view: 'ai-model', error: null }));
    document.getElementById('edit-prompt')?.addEventListener('input', (e) => {
        state.editPrompt = (e.target as HTMLTextAreaElement).value;
        const button = document.getElementById('generate-edit-btn') as HTMLButtonElement;
        if (button) {
            button.disabled = !state.editPrompt;
        }
    });
    document.getElementById('generate-edit-btn')?.addEventListener('click', editImage);
    document.getElementById('undo-edit-btn')?.addEventListener('click', undoEdit);
    document.getElementById('redo-edit-btn')?.addEventListener('click', redoEdit);
    if(state.resultImage) setupDownloadListeners();
};

const renderHistoryScreen = () => {
    const tryOnItems = state.history.filter(item => item.type === 'try-on');
    const aiModelItems = state.history.filter(item => item.type === 'ai-model');
    
    const tryOnIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.45a1 1 0 0 0 .94.86h13.4c.56 0 1.03-.44 1.08-.99l.58-3.45a2 2 0 0 0-1.34-2.23z"></path><path d="M4 10h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10z"></path></svg>`;
    const aiModelIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8.5l-3 3-3-3 3-3 3 3z"/><path d="M12 10.5V14"/><path d="M12 14c-4.66 0-8 1.5-8 4v2h16v-2c0-2.5-3.34-4-8-4z"/><path d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>`;
    
    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString('sr-RS', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };
    
    const renderHistoryItems = (items: HistoryItem[]) => {
        if (items.length === 0) {
            const isVirtualTryOn = state.activeHistoryTab === 'try-on';
            const targetView = isVirtualTryOn ? 'try-on' : 'ai-model';
            return `
                <div class="no-history">
                    <div class="empty-icon">${isVirtualTryOn ? tryOnIcon : aiModelIcon}</div>
                    <h3>Nema kreacija</h3>
                    <p>Još nema kreacija u ${isVirtualTryOn ? 'Virtuelno Probaj' : 'AI Modeli'} kategoriji.</p>
                    <button class="btn btn-primary empty-cta" id="empty-state-cta">
                        ${isVirtualTryOn ? 'Probaj odeću' : 'Generiši AI model'}
                    </button>
                </div>
            `;
        }
        
        return items.map(item => `
            <div class="history-item">
                <div class="history-image-container">
                    <img src="${item.result}" alt="Kreacija" class="history-image"/>
                </div>
                <div class="history-info">
                    <div class="history-date">${formatDate(item.timestamp)}</div>
                    ${item.prompt ? `<div class="history-prompt">"${item.prompt}"</div>` : ''}
                    <div class="history-actions">
                        <div class="history-actions-row">
                            ${item.type === 'ai-model' ? `
                            <button class="btn-sm btn-tertiary edit-history-item" data-id="${item.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                Uredi
                            </button>
                            ` : ''}
                            <button class="btn-sm btn-secondary delete-history-item" data-id="${item.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                Obriši
                            </button>
                        </div>
                        <div class="dropdown">
                            <button class="btn-sm btn-primary download-history-btn">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                Preuzmi
                            </button>
                            <div class="dropdown-content">
                                <a href="#" class="download-history-post" data-id="${item.id}">Post (1:1)</a>
                                <a href="#" class="download-history-story" data-id="${item.id}">Story (9:16)</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    };

    const downloadImage = (imageDataUrl: string, aspectX: number, aspectY: number, filename: string) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const originalWidth = img.width;
            const originalHeight = img.height;
            const originalRatio = originalWidth / originalHeight;
            const targetRatio = aspectX / aspectY;

            let sx, sy, sWidth, sHeight;

            if (originalRatio > targetRatio) { // Original is wider than target
                sHeight = originalHeight;
                sWidth = sHeight * targetRatio;
                sx = (originalWidth - sWidth) / 2;
                sy = 0;
            } else { // Original is taller than or same as target
                sWidth = originalWidth;
                sHeight = sWidth / targetRatio;
                sx = 0;
                sy = (originalHeight - sHeight) / 2;
            }

            const targetWidth = Math.min(sWidth, 2048);
            canvas.width = targetWidth;
            canvas.height = targetWidth / targetRatio;
            
            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
        img.crossOrigin = "anonymous";
        img.src = imageDataUrl;
    };

    const downloadResult = (aspectX: number, aspectY: number) => {
        if (!state.resultImage) return;
        const filename = aspectX === 1 ? 'Masterbot_post.png' : 'Masterbot_story.png';
        downloadImage(state.resultImage, aspectX, aspectY, filename);
    };

    const setupHistoryScreenListeners = () => {
        document.getElementById('back-btn')?.addEventListener('click', () => {
            setState({ view: 'home' });
        });

        document.querySelectorAll('.history-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab') as 'try-on' | 'ai-model';
                setState({ activeHistoryTab: tabName });
            });
        });

        document.querySelectorAll('.edit-history-item').forEach(button => {
            button.addEventListener('click', () => {
                const itemId = button.getAttribute('data-id');
                const item = state.history.find(h => h.id === itemId);

                if (item && item.type === 'ai-model' && item.clothingImages) {
                    const clothingImagesForState = item.clothingImages.map(dataUrl => {
                        const parts = dataUrl.split(',');
                        const meta = parts[0].match(/:(.*?);/);
                        const mimeType = meta ? meta[1] : 'image/png';
                        const base64 = parts[1];
                        return { file: null, base64, mimeType };
                    });

                    setState({
                        view: 'editor',
                        resultImage: item.result,
                        originalEditorImage: item.result,
                        currentHistoryId: item.id,
                        prompt: item.prompt || '',
                        clothingImages: clothingImagesForState,
                        error: null,
                        editPrompt: '',
                        imageHistory: [],
                        redoHistory: []
                    });
                }
            });
        });

        document.querySelectorAll('.delete-history-item').forEach(button => {
            button.addEventListener('click', () => {
                const itemId = button.getAttribute('data-id');
                if (itemId && confirm('Da li ste sigurni da želite da obrišete ovu kreaciju?')) {
                    removeFromHistory(itemId);
                }
            });
        });

        document.querySelectorAll('.download-history-item').forEach(button => {
            button.addEventListener('click', () => {
                const itemId = button.getAttribute('data-id');
                const item = state.history.find(h => h.id === itemId);
                if (item) {
                    const link = document.createElement('a');
                    link.href = item.result;
                    link.download = `Masterbot_kreacija_${item.id.substring(0, 8)}.png`;
                    link.click();
                }
            });
        });

        document.querySelectorAll('.download-history-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdownContent = button.nextElementSibling as HTMLElement;
                const isVisible = dropdownContent.classList.contains('show');

                document.querySelectorAll('.dropdown-content.show').forEach(openDropdown => {
                    openDropdown.classList.remove('show');
                });

                if (!isVisible) {
                    dropdownContent.classList.add('show');
                }
            });
        });

        document.querySelectorAll('.download-history-post').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const itemId = link.getAttribute('data-id');
                const item = state.history.find(h => h.id === itemId);
                if (item) {
                    downloadImage(item.result, 1, 1, `Masterbot_post_${item.id.substring(0, 8)}.png`);
                }
                (link.closest('.dropdown-content') as HTMLElement)?.classList.remove('show');
            });
        });

        document.querySelectorAll('.download-history-story').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const itemId = link.getAttribute('data-id');
                const item = state.history.find(h => h.id === itemId);
                if (item) {
                    downloadImage(item.result, 9, 16, `Masterbot_story_${item.id.substring(0, 8)}.png`);
                }
                (link.closest('.dropdown-content') as HTMLElement)?.classList.remove('show');
            });
        });

        // Hide dropdown when clicking outside
        window.addEventListener('click', (event) => {
            if (!(event.target as HTMLElement).matches('.download-history-btn')) {
                document.querySelectorAll('.dropdown-content.show').forEach(openDropdown => {
                    openDropdown.classList.remove('show');
                });
            }
        });

        const emptyCtaButton = document.getElementById('empty-state-cta');
        if (emptyCtaButton) {
            emptyCtaButton.addEventListener('click', () => {
                const targetView = state.activeHistoryTab === 'try-on' ? 'try-on' : 'ai-model';
                setState({ view: targetView });
            });
        }
    };
    
    app.innerHTML = `
        <div class="container">
            <div class="history-header">
                <button class="btn btn-secondary" id="back-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                    </svg>
                    Nazad
                </button>
                <div class="history-title">
                    <h2>
                        <span class="title-icon">🎨</span>
                        Moje Kreacije
                    </h2>
                    <p class="title-subtitle">Tvoja kolekcija Masterbot kreacija</p>
                </div>
            </div>
            
            <div class="history-tabs">
                <button class="history-tab ${state.activeHistoryTab === 'try-on' ? 'active' : ''}" data-tab="try-on">
                    <span class="tab-icon">${tryOnIcon}</span>
                    <span class="tab-text">Virtuelno Probaj</span>
                    <span class="tab-count">${tryOnItems.length}</span>
                </button>
                <button class="history-tab ${state.activeHistoryTab === 'ai-model' ? 'active' : ''}" data-tab="ai-model">
                    <span class="tab-icon">${aiModelIcon}</span>
                    <span class="tab-text">AI Modeli</span>
                    <span class="tab-count">${aiModelItems.length}</span>
                </button>
            </div>
            
            <div class="history-content">
                ${state.activeHistoryTab === 'try-on' ? renderHistoryItems(tryOnItems) : renderHistoryItems(aiModelItems)}
            </div>
        </div>
    `;
    setupHistoryScreenListeners();
};

const renderVideoGeneratorScreen = () => {
    app.innerHTML = `
    <div class="split-container">
      <div class="control-panel">
        <button class="btn-back" id="back-to-result-btn">&larr; Nazad na rezultat</button>
        <div class="panel-header">
            <h2>Kreiraj Video</h2>
            <p>Opišite pokret ili akciju. Kratko i jasno (npr: "šeta", "maše", "okreće se").</p>
        </div>
        
        <div class="input-group">
            <label>Slika za animaciju</label>
            <img src="${state.resultImage}" alt="Slika za animaciju" class="image-preview-small"/>
        </div>

        <div class="input-group">
            <label for="video-prompt">Opišite animaciju</label>
            <textarea id="video-prompt" placeholder="Kratko: 'šeta', 'maše rukom', 'okreće glavu'...">${state.videoPrompt}</textarea>
        </div>
        
        ${state.error ? `<div class="error-message">${state.error}</div>` : ''}
        <button class="btn btn-primary" id="generate-video-btn" ${!state.videoPrompt ? 'disabled' : ''}>Generiši Video</button>
      </div>
      <div class="result-panel">
        ${
            state.isLoading 
            ? `<div class="loader-container"><div class="spinner"></div><p>${state.loadingMessage}</p></div>`
            : state.resultVideoUrl
            ? `
                <div class="result-container">
                    <video src="${state.resultVideoUrl}" class="result-video" controls autoplay loop></video>
                    <div class="button-group">
                        <a href="${state.resultVideoUrl}" download="masterbot-fashion.mp4" class="btn btn-primary">Preuzmi Video</a>
                        <button class="btn btn-secondary" id="try-again-video-btn">Kreiraj novi</button>
                    </div>
                </div>`
            : `<p>Vaš generisani video će se pojaviti ovde.</p>`
        }
      </div>
    </div>`;

    document.getElementById('back-to-result-btn')?.addEventListener('click', () => setState({ view: 'ai-model', resultVideoUrl: null, videoPrompt: '' }));
    document.getElementById('video-prompt')?.addEventListener('input', (e) => {
        state.videoPrompt = (e.target as HTMLTextAreaElement).value;
        const button = document.getElementById('generate-video-btn') as HTMLButtonElement;
        if (button) {
            button.disabled = !state.videoPrompt;
        }
    });
    document.getElementById('generate-video-btn')?.addEventListener('click', generateVideo);
    document.getElementById('try-again-video-btn')?.addEventListener('click', () => setState({ resultVideoUrl: null, videoPrompt: '', error: null }));
};


const render = () => {
  app.innerHTML = '';
  switch (state.view) {
    case 'home':
      renderHomeScreen();
      break;
    case 'try-on':
      renderTryOnScreen();
      break;
    case 'ai-model':
      renderAIModelScreen();
      break;
    case 'editor':
      renderEditorScreen();
      break;
    case 'video-generator':
        renderVideoGeneratorScreen();
        break;
    case 'history':
        renderHistoryScreen();
        break;
  }
};

// Initialize history from localStorage
setState({ history: loadHistoryFromStorage() });

render();