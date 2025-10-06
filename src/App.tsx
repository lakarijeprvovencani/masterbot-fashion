import React, { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './components/Login'
import SignUp from './components/SignUp'
import Dashboard from './components/Dashboard'

const AppContent: React.FC = () => {
  const { user, loading } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)

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

  if (user) {
    return <Dashboard />
  }

  if (isSignUp) {
    return <SignUp onSwitchToLogin={() => setIsSignUp(false)} />
  }

  return <Login onSwitchToSignUp={() => setIsSignUp(true)} />
}

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
