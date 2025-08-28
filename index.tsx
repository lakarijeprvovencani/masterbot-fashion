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

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

type AppView = 'home' | 'try-on' | 'ai-model' | 'editor' | 'video-generator';

interface AppState {
  view: AppView;
  isLoading: boolean;
  error: string | null;
  userImage: { file: File, base64: string, mimeType: string } | null;
  clothingImage: { file: File, base64: string, mimeType: string } | null; // For Try-On
  clothingImages: Array<{ file: File, base64: string, mimeType: string }>; // For AI Model
  prompt: string;
  videoPrompt: string;
  resultImage: string | null;
  resultVideoUrl: string | null;
  loadingMessage: string;
  editPrompt: string;
  originalEditorImage: string | null;
  imageHistory: string[]; // Stack of previous image versions for undo functionality
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

  // Background with clothing images
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
    const img = document.createElement('img');
    img.src = `data:${clothingImages[0].mimeType};base64,${clothingImages[0].base64}`;
    img.style.cssText = `
      width: 80%;
      height: 80%;
      object-fit: cover;
      border-radius: 15px;
      opacity: 0.3;
    `;
    background.appendChild(img);
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
    const errorMessage = (error as Error)?.message || 'Došlo je do nepoznate greške.';
    
    if (errorMessage.includes('sensitive words') || errorMessage.includes('Responsible AI practices')) {
        return 'AI je detektovao potencijalno osetljiv sadržaj. Molimo vas da preformulišete vaš opis i pokušate ponovo, izbegavajući reči koje se odnose na uzrast, specifične lokacije ili druge osetljive teme.';
    }
     if (errorMessage.includes('operation failed')) {
        return `AI greška: ${errorMessage.split('AI greška:')[1] || 'Operacija nije uspela.'}`;
    }
    if (errorMessage.includes('AI nije uspeo')) {
        return errorMessage;
    }

    console.error("Originalna greška:", error);
    return 'Došlo je do neočekivane greške. Pokušajte ponovo.';
};


const generateVirtualTryOn = async () => {
  if (!state.userImage || !state.clothingImage) {
    setState({ error: 'Molimo vas odaberite obe slike.' });
    return;
  }
  
  setState({ error: null, isLoading: true, resultImage: null, resultVideoUrl: null });

  try {
    const userImagePart = { inlineData: { data: state.userImage.base64, mimeType: state.userImage.mimeType } };
    const clothingImagePart = { inlineData: { data: state.clothingImage.base64, mimeType: state.clothingImage.mimeType } };
    const systemInstruction = 'IMPORTANT: Do not add, remove, or modify any clothing items, logos, text, patterns, or details on the clothing. Keep all garments exactly as shown in the provided images. Do not add brand logos, text overlays, or any decorative elements that are not already present. Preserve the original design, colors, and details of each clothing item precisely.';
    const textPart = { text: `Take the clothing from the second image and realistically place it onto the person in the first image. The final image should only show the person wearing the new clothing in the original setting. ${systemInstruction}` };

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
    
    const imagePart = response.candidates?.[0]?.content?.parts.find(part => part.inlineData);
    if (imagePart?.inlineData) {
      const base64Image = imagePart.inlineData.data;
      setState({ resultImage: `data:image/png;base64,${base64Image}` });
    } else {
      throw new Error('AI nije uspeo da generiše sliku. Pokušajte sa drugim slikama.');
    }
  } catch (err) {
      setState({ error: getFriendlyErrorMessage(err) });
  } finally {
    setState({ isLoading: false });
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
        
        const basePrompt = state.prompt;
        const clothingInstruction = `The model in the generated image must be wearing all the exact clothing items provided in the images.`;
        const systemInstruction = `IMPORTANT: Do not add, remove, or modify any clothing items, logos, text, patterns, or details on the clothing. Keep all garments exactly as shown in the provided images. Do not add brand logos, text overlays, or any decorative elements that are not already present. Preserve the original design, colors, and details of each clothing item precisely.`;
        
        const fullPromptText = `${basePrompt}. ${clothingInstruction} ${systemInstruction}`.trim();
        const textPart = { text: fullPromptText };

        // Add delay for better UX
        await new Promise(resolve => setTimeout(resolve, 1500));
        scanningPopup.updateStatus('Masterbot kreira model...');

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
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
                setState({ resultImage: `data:image/png;base64,${base64Image}` });
            }, 1500);
        } else {
            scanningPopup.close();
            throw new Error('AI nije uspeo da generiše sliku. Pokušajte sa drugačijim opisom.');
        }

    } catch (err) {
        scanningPopup.close();
        setState({ view: 'ai-model', error: getFriendlyErrorMessage(err) });
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
            setState({ 
                resultImage: `data:image/png;base64,${base64Image}`, 
                editPrompt: '',
                imageHistory: currentHistory
            });
        } else {
            throw new Error('AI nije uspeo da izmeni sliku. Pokušajte sa drugačijim opisom.');
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
    setState({ error: null, isLoading: true, resultVideoUrl: null, loadingMessage: 'AI reditelj postavlja scenu...' });
    
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
            throw new Error('API ključ nije konfigurisan. Proverite .env.local fajl.');
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
                throw new Error(`Greška pri praćenju video generisanja: ${pollError.message}`);
            }
        }

        if (attempts >= maxAttempts) {
            throw new Error('Video generisanje je predugo trajalo (preko 10 minuta). Možda je server preopterećen. Pokušajte ponovo za nekoliko minuta.');
        }

        if (operation.error) {
            console.error('❌ Operation failed with error:', operation.error);
            throw new Error(`Video generation operation failed:\nAI greška: ${operation.error.message}`);
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
                    throw new Error(`Greška pri preuzimanju videa: ${response.status} ${response.statusText}`);
                }
                
                const blob = await response.blob();
                console.log('📦 Video blob size:', blob.size, 'bytes');
                console.log('📦 Video blob type:', blob.type);
                
                if (blob.size === 0) {
                    throw new Error('Preuzeti video je prazan. Pokušajte ponovo.');
                }
                
                const videoUrl = URL.createObjectURL(blob);
                console.log('🎥 Video URL created:', videoUrl);
                
                setState({ resultVideoUrl: videoUrl });
            } catch (downloadError) {
                console.error('❌ Download failed:', downloadError);
                throw new Error(`Greška pri preuzimanju videa: ${downloadError.message}`);
            }
        } else {
            console.error('❌ No download link in response');
            throw new Error('Video je generisan, ali download link nije dostupan. Ovo je greška API-ja. Pokušajte ponovo.');
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
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 3a4 4 0 0 0-4 4v1h8v-1a4 4 0 0 0-4-4Zm-6 6v3h12v-3a6 6 0 0 0-12 0Z"/></svg>
            <h3>Virtuelno Probaj</h3>
            <p>Postavi svoju sliku i sliku odeće da vidiš kako ti stoji.</p>
        </div>
        <div class="card" id="go-to-ai-model">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 2a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1ZM7 11a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H7Zm1 7v-5h8v5H8Zm6.5-12a3 3 0 1 0-3 3 3 3 0 0 0 3-3Zm-1.5.5a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5Z"/></svg>
            <h3>Generiši AI Modela</h3>
            <p>Kreiraj jedinstvenog AI modela sa odećom po izboru.</p>
        </div>
      </div>
    </div>`;
  document.getElementById('go-to-try-on')?.addEventListener('click', () => setState({ view: 'try-on', error: null, userImage: null, clothingImage: null, prompt: '', resultImage: null, resultVideoUrl: null }));
  document.getElementById('go-to-ai-model')?.addEventListener('click', () => {
    setState({ view: 'ai-model' });
    resetAIModelState();
  });
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
            <img src="/assets/fashionsiluetea.png" alt="Fashion silhouette" style="width: 60px; height: 60px; object-fit: contain; flex-shrink: 0;">
            <div style="flex: 1;">
                <h4 style="margin: 0 0 6px 0; color: #2c3e50; font-size: 14px; font-weight: 600;">💡 Savet za najbolji rezultat</h4>
                <p style="margin: 0; color: #5a6c7d; font-size: 13px; line-height: 1.4;">Najbolji rezultat generisanja se dobija ako je slika modela u donjem vešu.</p>
            </div>
        </div>
        
        <div class="input-group">
            <label for="user-image" class="file-input-label ${userImagePreview ? 'has-image' : ''}">
                ${userImagePreview 
                    ? `<img src="${userImagePreview}" class="image-preview" alt="Pregled korisnika">` 
                    : '<div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM20.944 20.004a.5.5 0 0 0-.447-.5h-17a.5.5 0 0 0-.447.5 10 10 0 0 0 17.894 0Z"/></svg><span>Dodaj svoju fotografiju</span></div>'
                }
                <input type="file" id="user-image" accept="image/*">
            </label>
        </div>

        <div class="input-group">
            <label for="clothing-image" class="file-input-label ${clothingImagePreview ? 'has-image' : ''}">
                 ${clothingImagePreview 
                    ? `<img src="${clothingImagePreview}" class="image-preview" alt="Pregled odeće">` 
                    : '<div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="m14.41 4.59-2.83 2.82L10.17 6 6 10.17l1.41 1.41 2.82-2.83 1.42 1.42-4.24 4.24-1.42-1.41L10.17 8 8.76 6.59 4.59 10.76l1.41 1.41L8.83 9.34l1.41 1.41-2.83 2.82L6 15.01l4.17 4.17 4.17-4.17-1.41-1.41-2.83 2.82-1.41-1.41 4.24-4.24 1.41 1.41 2.83-2.82-1.42-1.42-2.82 2.83-1.41-1.42 4.24-4.24 1.41 1.41L15.01 6l4.17 4.17-4.17 4.17-1.41-1.42 2.83-2.82-1.42-1.41-4.24 4.24-4.24-4.24-1.41 1.41 2.82 2.83 1.42-1.42 2.82-2.83 1.41 1.41-4.24 4.24-1.41-1.41-2.82 2.83L8.75 17.4l-4.16-4.17L8.76 9.06l1.41 1.41 2.83-2.83-1.42-1.41-2.82 2.83L7.35 7.65 3.18 11.82l4.17 4.17 1.41-1.41-2.82-2.83 1.41-1.41 4.24 4.24 4.24-4.24 1.41 1.41-2.83 2.82 1.42 1.41 2.83-2.82 1.41 1.41-4.24 4.24 4.17-4.17 4.16-4.17-4.16-4.17-4.17 4.17Z"/></svg><span>Dodaj fotografiju odeće</span></div>'
                }
                <input type="file" id="clothing-image" accept="image/*">
            </label>
        </div>
        
        ${state.error ? `<div class="error-message">${state.error}</div>` : ''}
        <button class="btn btn-primary" id="generate-try-on" ${!state.userImage || !state.clothingImage ? 'disabled' : ''}>Kreiraj</button>
      </div>
      <div class="result-panel">
        ${
            state.isLoading 
            ? `<div class="loader-container"><div class="spinner"></div><p>AI stilista kombinuje...</p></div>`
            : state.resultImage 
            ? `
                <div class="result-container">
                    <img src="${state.resultImage}" alt="Generisana slika" class="result-image"/>
                    <div class="button-group">
                        ${renderDownloadDropdown('masterbot-tryon')}
                        <button class="btn btn-secondary" id="try-again">Pokušaj ponovo</button>
                    </div>
                </div>`
            : `<p>Vaš rezultat će se pojaviti ovde.</p>`
        }
      </div>
    </div>`;

    document.getElementById('back-btn')?.addEventListener('click', () => setState({ view: 'home' }));
    document.getElementById('user-image')?.addEventListener('change', (e) => handleFileChange(e, 'userImage'));
    document.getElementById('clothing-image')?.addEventListener('change', (e) => handleFileChange(e, 'clothingImage'));
    document.getElementById('generate-try-on')?.addEventListener('click', generateVirtualTryOn);
    document.getElementById('try-again')?.addEventListener('click', () => setState({ resultImage: null, error: null }));
    if(state.resultImage) setupDownloadListeners();
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
                 <button class="btn btn-tertiary" id="try-again">Pokušaj ponovo</button>
            </div>`;
    } else {
        resultPanelContent = `<p>Vaš generisani model će se pojaviti ovde.</p>`;
    }

    app.innerHTML = `
    <div class="split-container">
      <div class="control-panel">
        <button class="btn-back" id="back-btn">&larr; Nazad na početnu</button>
        <div class="panel-header">
            <h2>Generiši AI modela</h2>
            <p>Dodajte odeću, akcesoare i druge elemente i opišite modela koga želite da vidite.</p>
        </div>
        
        <div class="input-group">
            <label for="ai-model-clothing-image">Odeća (do ${MAX_CLOTHING_IMAGES} slika)</label>
            <div class="image-preview-grid">
                ${state.clothingImages.map((img, index) => `
                    <div class="preview-item">
                        <img src="data:${img.mimeType};base64,${img.base64}" alt="Pregled odeće ${index + 1}">
                        <button class="remove-btn" data-index="${index}" aria-label="Ukloni sliku ${index + 1}">&times;</button>
                    </div>
                `).join('')}
            </div>
            ${state.clothingImages.length < MAX_CLOTHING_IMAGES ? `
                <label for="ai-model-clothing-image" class="btn btn-secondary upload-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6Z"/></svg>
                    <span>${state.clothingImages.length > 0 ? 'Dodaj još' : 'Dodaj fotografije'}</span>
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
    document.getElementById('edit-image')?.addEventListener('click', () => setState({ view: 'editor', originalEditorImage: state.resultImage, editPrompt: '', error: null, imageHistory: [] }));
    document.getElementById('create-video')?.addEventListener('click', () => setState({ view: 'video-generator', error: null, resultVideoUrl: null, videoPrompt: '' }));
    if(state.resultImage) setupDownloadListeners();
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
            ? `<div class="loader-container"><div class="spinner"></div><p>AI Pixshop radi...</p></div>`
            : state.resultImage
            ? `
                <div class="result-container">
                    <img src="${state.resultImage}" alt="Izmenjena slika" class="result-image"/>
                    <div class="button-group">
                        ${renderDownloadDropdown('masterbot-fashion-edit')}
                        ${state.imageHistory.length > 0 ? `<button class="btn btn-secondary" id="undo-edit-btn">Poništi poslednju izmenu</button>` : ''}
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
    document.getElementById('undo-edit-btn')?.addEventListener('click', () => {
        if (state.imageHistory.length > 0) {
            const previousImage = state.imageHistory[state.imageHistory.length - 1];
            const newHistory = state.imageHistory.slice(0, -1);
            setState({ 
                resultImage: previousImage, 
                imageHistory: newHistory,
                error: null, 
                editPrompt: '' 
            });
        }
    });
    if(state.resultImage) setupDownloadListeners();
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
  }
};

render();