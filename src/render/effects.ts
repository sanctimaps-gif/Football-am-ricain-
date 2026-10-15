import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Effets visuels sans fichiers externes :
 * - environnement d'éclairage procédural (ciel de nuit + rampes de projecteurs) pour les reflets PBR ;
 * - post-traitement : halo des projecteurs (bloom), étalonnage des couleurs et vignettage.
 */

/** Carte d'environnement « stade de nuit » générée une fois (PMREM). */
export function createStadiumEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  // dôme : nuit bleutée, halo lumineux au-dessus des tribunes
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 top = vec3(0.015, 0.03, 0.07);
        vec3 horizon = vec3(0.22, 0.26, 0.33);
        vec3 ground = vec3(0.05, 0.11, 0.05);
        vec3 c = h > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.55, h)) : mix(horizon * 0.6, ground, smoothstep(0.0, -0.25, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  env.add(dome);
  // rampes de projecteurs (sources très lumineuses aux quatre coins)
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 13, 11.5) });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), lamp);
      p.position.set(sx * 30, 20, sz * 24);
      p.lookAt(0, 0, 0);
      env.add(p);
    }
  }
  // reflet doux de la pelouse
  const turf = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.16, 0.05) }));
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = -4;
  env.add(turf);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose();
  });
  return tex;
}

/** Étalonnage : contraste, saturation, teinte chaude des hautes lumières, vignettage. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    contrast: { value: 1.06 },
    saturation: { value: 0.96 },
    vignette: { value: 0.32 },
    warm: { value: new THREE.Vector3(1.03, 1.0, 0.96) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float contrast; uniform float saturation; uniform float vignette; uniform vec3 warm; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.18) * contrast + 0.18;
      col *= mix(vec3(1.0), warm, smoothstep(0.3, 1.5, l));
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

export class PostFX {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, quality: 'medium' | 'high') {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    // cible HDR avec anticrénelage matériel (MSAA) : le rendu reste net malgré le post-traitement
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 2 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    if (quality === 'high') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.45, 0.92);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new ShaderPass(GradeShader));
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}

/** Texture de halo radial (projecteurs, lumières) pour des sprites additifs. */
export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,250,235,1)');
  g.addColorStop(0.18, 'rgba(255,244,215,0.75)');
  g.addColorStop(0.45, 'rgba(255,236,190,0.18)');
  g.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
