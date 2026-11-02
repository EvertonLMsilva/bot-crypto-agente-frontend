import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneView } from '../../src/components/SceneView';
import { mountApp } from '../../src/bootstrap';
import type { SceneOptions, SceneHandle } from '../../src/scene/mountScene';

afterEach(cleanup);
describe('interface e bootstrap', () => {
  it('inicializa aplicação com identificação fictícia e encerra o root', async () => {
    const host = document.createElement('div'); document.body.append(host);
    let unmount!: () => void;
    await act(async () => { unmount = mountApp(host); });
    expect(screen.getByRole('heading', { name: 'Fundação do escritório 3D' })).toBeTruthy();
    expect(screen.getByText('Simulação fictícia · pausada')).toBeTruthy();
    await act(async () => unmount()); expect(host.children).toHaveLength(0); host.remove();
  });
  it('mostra carregamento, pronto e limpa ao desmontar', async () => {
    const dispose = vi.fn(); let options!: SceneOptions;
    const loadScene = vi.fn(async () => ({ mountScene: (_host: HTMLElement, opts: SceneOptions) => { options = opts; return { dispose }; } }));
    const view = render(<SceneView loadScene={loadScene} />);
    expect(screen.getByRole('status').textContent).toContain('Preparando');
    await waitFor(() => expect(loadScene).toHaveBeenCalledOnce());
    await act(async () => options.onReady());
    expect(screen.getByRole('status').textContent).toContain('Cena 3D pronta');
    view.unmount(); expect(dispose).toHaveBeenCalledOnce();
  });
  it('apresenta mensagem compreensível na falha de carregamento', async () => {
    render(<SceneView loadScene={async () => { throw new Error('chunk'); }} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível');
  });
  it('apresenta falha da renderização', async () => {
    render(<SceneView loadScene={async () => ({ mountScene: (_host, opts) => {
      opts.onError(); return { dispose: vi.fn() };
    } })} />);
    expect((await screen.findByRole('alert')).textContent).toContain('WebGL');
  });
  it('não monta se o carregamento terminar depois da desmontagem', async () => {
    type Module = { mountScene: (host: HTMLElement, options: SceneOptions) => SceneHandle };
    let resolve!: (value: Module) => void;
    const pending = new Promise<Module>(r => { resolve = r; });
    const mountScene = vi.fn(() => ({ dispose: vi.fn() })); const view = render(<SceneView loadScene={() => pending} />);
    view.unmount(); await act(async () => resolve({ mountScene })); expect(mountScene).not.toHaveBeenCalled();
  });
});
