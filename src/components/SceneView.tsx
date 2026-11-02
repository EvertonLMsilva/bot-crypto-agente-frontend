import { useEffect, useRef, useState } from 'react';
import type { SceneHandle, SceneOptions } from '../scene/mountScene';

type SceneLoader = () => Promise<{ mountScene: (host: HTMLElement, options: SceneOptions) => SceneHandle }>;
const defaultLoader: SceneLoader = () => import('../scene/mountScene');

export function SceneView({ loadScene = defaultLoader }: { loadScene?: SceneLoader }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    let active = true;
    let scene: SceneHandle | undefined;
    setState('loading');
    loadScene().then(module => {
      if (!active || !host.current) return;
      scene = module.mountScene(host.current, {
        onReady: () => { if (active) setState('ready'); },
        onError: () => { if (active) setState('failed'); },
      });
    }).catch(() => { if (active) setState('failed'); });
    return () => { active = false; scene?.dispose(); };
  }, [loadScene]);

  return <section className="scene-panel" aria-label="Visualização 3D">
    <div className="scene-meta"><span>AMBIENTE DE REFERÊNCIA</span><span>01 / FUNDAÇÃO</span></div>
    <div className="scene-host" ref={host} />
    {state === 'failed' ? <div className="scene-message error" role="alert">
      <strong>Não foi possível exibir a cena 3D.</strong>
      <span>Verifique se o navegador oferece WebGL e aceleração gráfica. Recarregue a página para tentar novamente.</span>
    </div> : <p className={`scene-status ${state}`} role="status">
      <span className="dot" />{state === 'loading' ? 'Preparando a cena 3D…' : 'Cena 3D pronta'}
    </p>}
    <div className="scene-caption"><span>Piso · cubo · esfera · cilindro</span><span>Câmera fixa / luz básica</span></div>
  </section>;
}
