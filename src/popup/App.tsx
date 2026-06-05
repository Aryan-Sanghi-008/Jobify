import Profile from './pages/Profile';
import CoverLetters from './pages/CoverLetters';
import Tracker from './pages/Tracker';
import Settings from './pages/Settings';

export default function App() {
  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-gray-900">Job Autofill</h1>
      <Profile />
      <CoverLetters />
      <Tracker />
      <Settings />
    </div>
  );
}
