import { useState } from 'react';
import { authAPI } from '../services/api';

interface LoginProps {
  onLogin: () => void;
}

const Login = ({ onLogin }: LoginProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFirstUser, setIsFirstUser] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      let response;
      if (isFirstUser) {
        response = await authAPI.signup(email, password);
        // After signup, automatically login
        if (response.status === 201) {
          response = await authAPI.login(email, password);
        }
      } else {
        response = await authAPI.login(email, password);
      }

      if (response.data && response.data.token) {
        // Save token to localStorage
        localStorage.setItem('token', response.data.token);
        onLogin();
      }
    } catch (err: any) {
      if (err.response && err.response.status === 403) {
        // If we get a 403 during signup, it means users already exist
        setError('User already exists. Please login instead.');
        setIsFirstUser(false);
      } else if (err.response && err.response.status === 401) {
        setError('Invalid email or password');
      } else {
        setError('An error occurred. Please try again.');
        console.error('Login error:', err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsFirstUser(!isFirstUser);
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isFirstUser ? 'Create Admin Account' : 'Sign in to your account'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {isFirstUser 
              ? 'Setup your first admin user'
              : 'Enter your credentials to access the admin panel'}
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <input type="hidden" name="remember" defaultValue="true" />
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm mt-2">{error}</div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {isLoading ? 'Processing...' : isFirstUser ? 'Create Account' : 'Sign in'}
            </button>
          </div>
        </form>

        <div className="text-sm text-center">
          <button
            type="button"
            className="font-medium text-indigo-600 hover:text-indigo-500"
            onClick={toggleMode}
          >
            {isFirstUser
              ? 'Already have an account? Sign in'
              : 'First time? Create admin account'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login; 