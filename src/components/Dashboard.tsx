import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../lib/supabase'
import CreateModel from './CreateModel'

const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth()
  const [hasModels, setHasModels] = useState(false)
  const [modelsCount, setModelsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState<'dashboard' | 'create-model' | 'dress-model'>('dashboard')

  const checkUserModels = async () => {
    if (user) {
      try {
        const { data: hasModelsData } = await db.userHasModels(user.id)
        const { count } = await db.getUserModelsCount(user.id)
        
        setHasModels(hasModelsData)
        setModelsCount(count)
      } catch (error) {
        console.error('Error checking user models:', error)
      } finally {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    checkUserModels()
  }, [user])

  // Refresh when coming back from create model
  useEffect(() => {
    if (currentView === 'dashboard') {
      checkUserModels()
    }
  }, [currentView])

  const handleSignOut = async () => {
    await signOut()
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (currentView === 'create-model') {
    return <CreateModel onBack={() => setCurrentView('dashboard')} />
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-content">
          <div>
            <h1 className="dashboard-title">Fashion Model Creator</h1>
            <p className="dashboard-user">Welcome back, {user?.email}</p>
          </div>
          <button onClick={handleSignOut} className="btn-signout">
            Sign Out
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="welcome-card">
          <h2>Welcome to Fashion Model Creator!</h2>
          <div className="info-box">
            <h3>Follow these 2 simple steps:</h3>
            <ol>
              <li><strong>Create Model:</strong> Generate your fashion model using AI</li>
              <li><strong>Dress Model:</strong> Style your model with different outfits</li>
            </ol>
            {!hasModels && (
              <p>⚠️ You need to create at least one model before you can dress it.</p>
            )}
          </div>
        </div>

        <div className="action-cards">
          <div className="action-card">
            <div className="action-card-icon primary">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
              </svg>
            </div>
            <h3>Create Model</h3>
            <p>Generate a new fashion model using AI</p>
            <button className="btn-action primary" onClick={() => setCurrentView('create-model')}>
              Create New Model
            </button>
          </div>

          <div className={`action-card ${!hasModels ? 'action-card-disabled' : ''}`}>
            <div className={`action-card-icon ${hasModels ? 'success' : 'disabled'}`}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
              </svg>
            </div>
            <h3>Dress Model</h3>
            <p>
              {hasModels 
                ? `Style your model with different outfits (${modelsCount} model${modelsCount > 1 ? 's' : ''} available)`
                : 'Create a model first to unlock this feature'
              }
            </p>
            <button className={`btn-action ${hasModels ? 'success' : 'disabled'}`} disabled={!hasModels}>
              {hasModels ? 'Dress Your Model' : 'Create Model First'}
            </button>
          </div>
        </div>

        {hasModels && (
          <div className="stats-card">
            <h3>Your Models</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{modelsCount}</div>
                <div className="stat-label">Total Models</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{modelsCount}</div>
                <div className="stat-label">Completed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">0</div>
                <div className="stat-label">Dressed Models</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default Dashboard
