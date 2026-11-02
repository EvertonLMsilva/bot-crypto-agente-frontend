import { SceneView } from './components/SceneView';
import { SimulationStatus } from './components/SimulationStatus';
import { createSnapshot } from './fixtures/simulation';

const snapshot = createSnapshot();
export function App() {
  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="/">BOT <span>CRUPTO</span></a><span className="phase">FASE 02 · TÓPICO 2.1</span></header>
    <div className="intro"><p className="eyebrow">ESCRITÓRIO VIRTUAL</p>
      <h1>Fundação do escritório 3D</h1><p>O primeiro espaço da simulação: uma cena simples, com dados inteiramente fictícios.</p></div>
    <div className="workspace"><SceneView /><SimulationStatus snapshot={snapshot} /></div>
    <footer><span><span className="dot" /> Ambiente local · dados simulados</span><span>Fundação visual / 2.1</span></footer>
  </main>;
}
