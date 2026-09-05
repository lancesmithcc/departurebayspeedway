import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const vertexShader = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;

// Linear HDR history lives before OutputPass, so tone mapping happens only once.
// Two half-resolution targets keep the tracer affordable on phones. No history
// draw, allocation per frame, or extra pass runs when a visual pickup is inactive.
export class PowerupPostPass extends Pass {
  constructor() {
    super();
    this.enabled = false;
    this.kind = null;
    this.active = null;
    this.historyValid = false;
    const options = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false };
    this.history = new THREE.WebGLRenderTarget(1, 1, options);
    this.nextHistory = new THREE.WebGLRenderTarget(1, 1, options);
    this.tracer = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        current: { value: null }, previous: { value: null },
        texel: { value: new THREE.Vector2(1, 1) },
        valid: { value: false }, decay: { value: 0.9 },
      }, vertexShader,
      fragmentShader: `uniform sampler2D current,previous;
uniform vec2 texel;uniform bool valid;uniform float decay;varying vec2 vUv;
void main(){
  vec3 c=texture2D(current,vUv).rgb*.52;
  c+=texture2D(current,vUv+vec2(texel.x,0.)).rgb*.12;
  c+=texture2D(current,vUv-vec2(texel.x,0.)).rgb*.12;
  c+=texture2D(current,vUv+vec2(0.,texel.y)).rgb*.12;
  c+=texture2D(current,vUv-vec2(0.,texel.y)).rgb*.12;
  if(valid)c=max(c,texture2D(previous,vUv).rgb*decay);
  gl_FragColor=vec4(c,1.);
}`,
    });
    this.effect = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { current: { value: null }, trail: { value: null }, beer: { value: false } },
      vertexShader,
      fragmentShader: `uniform sampler2D current,trail;uniform bool beer;varying vec2 vUv;
void main(){
  vec4 c=texture2D(current,vUv);
  if(beer){c.rgb=mix(c.rgb,texture2D(trail,vUv).rgb,.44);}
  else{
    float grey=dot(c.rgb,vec3(.2126,.7152,.0722));
    c.rgb=max(vec3(0.),mix(vec3(grey),c.rgb,1.55))*1.07;
  }
  gl_FragColor=c;
}`,
    });
    this.quad = new FullScreenQuad(this.effect);
  }

  update(state, active, dt) {
    const kind = state === 'riding' && ['beer', 'coffee'].includes(active?.kind) ? active.kind : null;
    // Object identity also catches replacing a beer with another beer, or a reset
    // followed by a pickup of the same kind between rendered frames.
    if (kind !== this.kind || active !== this.active) this.historyValid = false;
    this.kind = kind;
    this.active = active;
    this.enabled = kind !== null;
    this.effect.uniforms.beer.value = kind === 'beer';
    this.tracer.uniforms.decay.value = Math.pow(0.9, Math.max(0, dt) * 60);
  }

  setSize(width, height) {
    const w = Math.max(1, Math.ceil(width / 2)), h = Math.max(1, Math.ceil(height / 2));
    this.history.setSize(w, h);
    this.nextHistory.setSize(w, h);
    this.tracer.uniforms.texel.value.set(1 / w, 1 / h);
    this.historyValid = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    if (this.kind === 'beer') {
      const u = this.tracer.uniforms;
      u.current.value = readBuffer.texture;
      u.previous.value = this.history.texture;
      u.valid.value = this.historyValid;
      this.quad.material = this.tracer;
      renderer.setRenderTarget(this.nextHistory);
      this.quad.render(renderer);
      [this.history, this.nextHistory] = [this.nextHistory, this.history];
      this.historyValid = true;
    }
    this.effect.uniforms.current.value = readBuffer.texture;
    this.effect.uniforms.trail.value = this.history.texture;
    this.quad.material = this.effect;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.history.dispose();
    this.nextHistory.dispose();
    this.tracer.dispose();
    this.effect.dispose();
    this.quad.dispose();
  }
}
