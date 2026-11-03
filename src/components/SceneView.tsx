import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { SceneHandle, SceneOptions } from '../scene/mountScene';
import type { SceneSelection } from '../contracts/selection';
import type { PanelPresentation } from '../contracts/panels';

const OfficePanels = lazy(() => import('./OfficePanels').then(module => ({ default: module.OfficePanels })));

type SceneLoader = () => Promise<{ mountScene: (host: HTMLElement, options: SceneOptions) => SceneHandle }>;
const defaultLoader: SceneLoader = () => import('../scene/mountScene');

export function SceneView({ loadScene = defaultLoader }: { loadScene?: SceneLoader }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<SceneHandle | undefined>(undefined);
  const [selection, setSelection] = useState<SceneSelection | null>(null);
  const [panels, setPanels] = useState<PanelPresentation | undefined>(undefined);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    let active = true;
    let scene: SceneHandle | undefined;
    setState('loading');
    setSelection(null);
    setPanels(undefined);
    loadScene().then(module => {
      if (!active || !host.current) return;
      scene = module.mountScene(host.current, {
        onReady: () => { if (active) setState('ready'); },
        onError: () => { if (active) setState('failed'); },
        onSelection: value => { if (active) setSelection(value); },
        onPanels: value => { if (active) setPanels(value); },
      });
      handle.current = scene;
    }).catch(() => { if (active) setState('failed'); });
    return () => { active = false; handle.current = undefined; scene?.dispose(); };
  }, [loadScene]);

  return <section className="scene-panel" aria-label="Visualização 3D">
    <div className="scene-meta"><span>ESCRITÓRIO VIRTUAL</span><span>06 / TELÃO E PAINÉIS</span></div>
    <div className="scene-host" ref={host} />
    {state === 'failed' ? <div className="scene-message error" role="alert">
      <strong>Não foi possível exibir a cena 3D.</strong>
      <span>Verifique WebGL e aceleração gráfica. Se o contexto foi perdido, a cena retomará quando ele for restaurado. Recarregue a página se necessário.</span>
    </div> : <p className={`scene-status ${state}`} role="status">
      <span className="dot" />{state === 'loading' ? 'Preparando a cena 3D…' : 'Cena 3D pronta'}
    </p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '12px 14px', borderTop: '1px solid #263747' }}>
      <button type="button" disabled={state !== 'ready'} onClick={() => handle.current?.resetCamera?.()}>Reenquadrar</button>
      <button type="button" disabled={state !== 'ready' || !selection} onClick={() => handle.current?.clearSelection?.()}>Limpar seleção</button>
      <span aria-live="polite" style={{ color: '#fff4df', background: '#101b27e6', padding: 4, fontSize: 12 }}>
        {selection ? `${selection.type === 'room' ? 'Ambiente' : selection.type === 'station' ? 'Posto' : 'Personagem'}: ${selection.id} · fictício` : 'Arraste para girar · roda/pinça para zoom · botão direito/dois dedos para pan · toque para selecionar'}
      </span>
    </div>
    <div className="scene-caption"><span>Cinco personagens fictícios · em espera</span><span>Um pavimento / postos reservados</span></div>
    {panels && <Suspense fallback={<p>Preparando painéis fictícios…</p>}><OfficePanels data={panels} /></Suspense>}
  </section>;
}
