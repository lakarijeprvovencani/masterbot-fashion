import { GoogleGenAI } from '@google/genai'

// Gemini API key - trebao bi biti u .env fajlu
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyBLmGV7kgxDjIjXVDZ6Y7QK3HyMQJZFKV0'

const client = new GoogleGenAI({ apiKey: API_KEY })

interface GenerateModelOptions {
  prompt: string
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:5'
}

export const generateFashionModel = async (options: GenerateModelOptions): Promise<string> => {
  try {
    const { prompt, aspectRatio = '9:16' } = options
    
    // Kreiranje detaljnog prompta za fashion model
    const enhancedPrompt = `Create a high-quality, professional fashion model image. ${prompt}. 
    Style: Editorial fashion photography, professional lighting, clean background, 
    full body shot, fashion runway quality, high resolution, photorealistic.
    The model should be suitable for fashion design and clothing presentation.`
    
    // Korišćenje Gemini 2.5 Flash IMAGE modela za generisanje slika
    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: enhancedPrompt,
      config: {
        responseModalities: ['Image'],
        imageConfig: {
          aspectRatio: aspectRatio
        }
      }
    })
    
    const response = result.response
    
    // Pronalaženje inline data (slike) u odgovoru
    for (const candidate of response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData) {
          // Kreiranje base64 data URL-a od inline slike
          const base64Data = part.inlineData.data
          const mimeType = part.inlineData.mimeType || 'image/png'
          return `data:${mimeType};base64,${base64Data}`
        }
      }
    }
    
    throw new Error('No image generated in response')
    
  } catch (error: any) {
    console.error('Error generating fashion model:', error)
    throw new Error(error.message || 'Failed to generate fashion model. Please try again.')
  }
}

export const analyzeUploadedImage = async (imageFile: File): Promise<{
  description: string
  suggestions: string[]
}> => {
  try {
    // Konvertovanje slike u base64
    const base64Image = await fileToBase64(imageFile)
    
    const prompt = `Analyze this image for fashion modeling purposes. 
    Describe the person's appearance, pose, and suitability for fashion modeling.
    Provide suggestions for how to best use this as a fashion model.
    Keep the response concise and professional.`
    
    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { text: prompt },
        { 
          inlineData: {
            mimeType: imageFile.type,
            data: base64Image.split(',')[1]
          }
        }
      ]
    })
    
    const response = result.response
    const text = response.text()
    
    return {
      description: text,
      suggestions: [
        'Consider professional lighting for best results',
        'Full body shots work best for fashion modeling',
        'Ensure clear, high-resolution images'
      ]
    }
    
  } catch (error) {
    console.error('Error analyzing image:', error)
    throw new Error('Failed to analyze image. Please try again.')
  }
}

// Helper function to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = error => reject(error)
  })
}

