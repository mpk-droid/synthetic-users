import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Personas from './pages/Personas';
import PersonaDetail from './pages/PersonaDetail';
import PersonaCreate from './pages/PersonaCreate';
import Journeys from './pages/Journeys';
import JourneyDetail from './pages/JourneyDetail';
import NewRun from './pages/NewRun';
import RunDetail from './pages/RunDetail';
import Environments from './pages/Environments';
import Findings from './pages/Findings';
import About from './pages/About';
import ApiDocs from './pages/ApiDocs';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/personas" element={<Personas />} />
        <Route path="/personas/new" element={<PersonaCreate />} />
        <Route path="/personas/:id" element={<PersonaDetail />} />
        <Route path="/journeys" element={<Journeys />} />
        <Route path="/journeys/:id" element={<JourneyDetail />} />
        <Route path="/environments" element={<Environments />} />
        <Route path="/findings" element={<Findings />} />
        <Route path="/runs/new" element={<NewRun />} />
        <Route path="/runs/:id" element={<RunDetail />} />
        <Route path="/about" element={<About />} />
        <Route path="/api-docs" element={<ApiDocs />} />
      </Route>
    </Routes>
  );
}
