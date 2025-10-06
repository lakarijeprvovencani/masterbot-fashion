import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { generateFashionModel, analyzeUploadedImage } from '../lib/gemini'

interface CreateModelProps {
  onBack?: () => void
}

const CreateModel: React.FC<CreateModelProps> = ({ onBack }) => {
  const { user } = useAuth()
  const [selectedOption, setSelectedOption] = useState<'ai' | 'upload' | null>(null)
  const [modelName, setModelName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [generatedModel, setGeneratedModel] = useState<any>(null)
  const [uploadedImage, setUploadedImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageAnalysis, setImageAnalysis] = useState<string>('')

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedImage(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    }
  }

  const generateAIModel = async () => {
    if (!prompt.trim()) {
      setError('Please enter a description for your model')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      // Korišćenje Gemini API-ja za generisanje modela
      const imageUrl = await generateFashionModel({
        prompt: prompt,
        aspectRatio: '9:16'
      })
      
      const mockModel = {
        id: Date.now().toString(),
        imageUrl: imageUrl,
        type: 'ai_generated',
        prompt: prompt,
        createdAt: new Date().toISOString()
      }
      
      setGeneratedModel(mockModel)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Failed to generate AI model. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const processUploadedImage = async () => {
    if (!uploadedImage || !user) return
    
    setLoading(true)
    setError('')
    
    try {
      // Prvo analiziraj sliku sa Gemini API-jem
      const analysis = await analyzeUploadedImage(uploadedImage)
      setImageAnalysis(analysis.description)
      
      // Upload slike na Supabase Storage
      const fileExt = uploadedImage.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('model-images')
        .upload(fileName, uploadedImage)
      
      if (uploadError) throw uploadError
      
      // Dobijanje public URL-a
      const { data: { publicUrl } } = supabase.storage
        .from('model-images')
        .getPublicUrl(fileName)
      
      const processedModel = {
        id: Date.now().toString(),
        imageUrl: publicUrl,
        type: 'uploaded',
        analysis: analysis.description,
        createdAt: new Date().toISOString()
      }
      
      setGeneratedModel(processedModel)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Failed to process uploaded image. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const saveModel = async () => {
    if (!generatedModel || !modelName.trim() || !user) return
    
    setLoading(true)
    setError('')
    
    try {
      const { error } = await supabase
        .from('fashion_models')
        .insert({
          user_id: user.id,
          model_name: modelName.trim(),
          model_image_url: generatedModel.imageUrl,
          model_data: {
            type: generatedModel.type,
            created_at: generatedModel.createdAt
          },
          status: 'completed'
        })
      
      if (error) throw error
      
      setSuccess(true)
      setError('')
      
      // Refresh dashboard after 2 seconds
      setTimeout(() => {
        if (onBack) {
          onBack()
        }
      }, 2000)
    } catch (err) {
      setError('Failed to save model. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const goToDressModel = () => {
    // Navigacija na Dress Model stranicu
    window.location.href = '/dress-model'
  }

  const resetForm = () => {
    setSelectedOption(null)
    setModelName('')
    setGeneratedModel(null)
    setUploadedImage(null)
    setPreviewUrl(null)
    setSuccess(false)
    setError('')
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-content">
          <div>
            <h1 className="dashboard-title">Create Model</h1>
            <p className="dashboard-user">Create your fashion model</p>
          </div>
          <button onClick={onBack || (() => window.history.back())} className="btn-signout" style={{background: '#667eea'}}>
            Back to Dashboard
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        {!success ? (
          <>
            {/* Opcije kreiranja */}
            {!selectedOption && (
              <div className="welcome-card">
                <h2>Choose Creation Method</h2>
                <div className="action-cards">
                  <div className="action-card" onClick={() => setSelectedOption('ai')}>
                    <div className="action-card-icon primary">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <h3>Create AI Model</h3>
                    <p>Generate a fashion model using artificial intelligence</p>
                    <button className="btn-action primary">Generate AI Model</button>
                  </div>

                  <div className="action-card" onClick={() => setSelectedOption('upload')}>
                    <div className="action-card-icon success">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3>Upload Your Photo</h3>
                    <p>Upload your photo and create yourself as a model</p>
                    <button className="btn-action success">Upload Photo</button>
                  </div>
                </div>
              </div>
            )}

            {/* AI Model Generation */}
            {selectedOption === 'ai' && (
              <div className="welcome-card">
                <h2>Generate AI Model</h2>
                <p style={{marginBottom: '20px', color: '#718096'}}>
                  Describe the type of fashion model you want to create. Be specific about features, style, pose, and appearance.
                </p>
                
                <div className="form-group">
                  <label htmlFor="model-prompt" className="form-label">Model Description</label>
                  <textarea
                    id="model-prompt"
                    className="form-input"
                    placeholder="e.g., A tall female model with long dark hair, wearing elegant pose, professional studio lighting, modern fashion style..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    style={{resize: 'vertical', minHeight: '100px'}}
                  />
                  <p style={{fontSize: '12px', color: '#a0aec0', marginTop: '5px'}}>
                    💡 Tip: The more detailed your description, the better the results!
                  </p>
                </div>
                
                {error && <div className="alert alert-error">{error}</div>}
                
                <div style={{textAlign: 'center', marginBottom: '20px'}}>
                  <button 
                    onClick={generateAIModel} 
                    className="btn btn-primary" 
                    disabled={loading || !prompt.trim()}
                    style={{width: 'auto', padding: '15px 30px'}}
                  >
                    {loading ? 'Generating AI Model...' : 'Generate AI Model'}
                  </button>
                </div>

                {loading && (
                  <div style={{textAlign: 'center'}}>
                    <div className="spinner" style={{margin: '0 auto'}}></div>
                    <p style={{marginTop: '10px', color: '#718096'}}>Creating your AI model with Gemini 2.5 Flash...</p>
                  </div>
                )}

                <div style={{textAlign: 'center', marginTop: '20px'}}>
                  <button onClick={resetForm} className="btn btn-secondary" style={{width: 'auto', padding: '10px 20px'}}>
                    Back to Options
                  </button>
                </div>
              </div>
            )}

            {/* Upload Photo */}
            {selectedOption === 'upload' && (
              <div className="welcome-card">
                <h2>Upload Your Photo</h2>
                <p style={{marginBottom: '20px', color: '#718096'}}>
                  Upload a clear photo of yourself to create your personal fashion model.
                </p>
                
                <div className="form-group">
                  <label htmlFor="photo-upload" className="form-label">Choose Photo</label>
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="form-input"
                    style={{padding: '8px'}}
                  />
                </div>

                {previewUrl && (
                  <div style={{textAlign: 'center', margin: '20px 0'}}>
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      style={{
                        maxWidth: '300px', 
                        maxHeight: '400px', 
                        borderRadius: '10px',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                      }} 
                    />
                  </div>
                )}

                {imageAnalysis && (
                  <div className="info-box" style={{marginTop: '20px'}}>
                    <h3>AI Analysis</h3>
                    <p style={{fontSize: '14px', lineHeight: '1.6'}}>{imageAnalysis}</p>
                  </div>
                )}

                {error && <div className="alert alert-error">{error}</div>}
                
                <div style={{textAlign: 'center', marginBottom: '20px'}}>
                  <button 
                    onClick={processUploadedImage} 
                    className="btn btn-primary" 
                    disabled={loading || !uploadedImage}
                    style={{width: 'auto', padding: '15px 30px'}}
                  >
                    {loading ? 'Processing Image...' : 'Create Model from Photo'}
                  </button>
                </div>

                <div style={{textAlign: 'center'}}>
                  <button onClick={resetForm} className="btn btn-secondary" style={{width: 'auto', padding: '10px 20px'}}>
                    Back to Options
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Success Screen - Model Created */
          <div className="welcome-card">
            <div className="success-container">
              <div className="success-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2>Model Created Successfully!</h2>
              
              {generatedModel && (
                <div style={{textAlign: 'center', margin: '20px 0'}}>
                  <img 
                    src={generatedModel.imageUrl} 
                    alt="Generated Model" 
                    style={{
                      maxWidth: '100%',
                      maxHeight: '500px', 
                      borderRadius: '10px',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                      objectFit: 'contain'
                    }} 
                  />
                  {generatedModel.prompt && (
                    <p style={{marginTop: '10px', fontSize: '12px', color: '#718096', fontStyle: 'italic'}}>
                      "{generatedModel.prompt}"
                    </p>
                  )}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="model-name" className="form-label">Give your model a name</label>
                <input
                  id="model-name"
                  type="text"
                  className="form-input"
                  placeholder="Enter model name"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                />
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <div style={{display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap'}}>
                <button 
                  onClick={saveModel} 
                  className="btn btn-primary" 
                  disabled={loading || !modelName.trim()}
                  style={{width: 'auto', padding: '12px 24px'}}
                >
                  {loading ? 'Saving...' : 'Save Model'}
                </button>
                
                <button 
                  onClick={goToDressModel} 
                  className="btn btn-primary" 
                  style={{width: 'auto', padding: '12px 24px', background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)'}}
                >
                  Use This Model
                </button>
                
                <button 
                  onClick={resetForm} 
                  className="btn btn-secondary" 
                  style={{width: 'auto', padding: '12px 24px'}}
                >
                  Create New Model
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default CreateModel
