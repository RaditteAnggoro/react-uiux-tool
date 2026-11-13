/** Dev-only source instrumentation. Never writes metadata into project files. */
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
import {
  createServer,
  type HtmlTagDescriptor,
  type ViteDevServer,
  type Plugin,
} from "vite";
import type { AnalysisReport, SourcePatch } from "../engine/types.js";
import { parseSource } from "../engine/analyzer.js";
import { readProjectFile } from "../engine/safety.js";

type DesignTarget = {
  file: string;
  componentName: string;
  defaultExported: boolean;
};

/** Vite uses forward-slash module IDs on every platform. */
export function designModulePath(root: string): string {
  return `${root.replace(/\\/g, "/").replace(/\/+$/, "")}/__uiux_design.jsx`;
}

export function instrumentSource(code: string, file: string): string {
  const source = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX,
  );
  const inserts: { at: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(source);
      if (/^[a-z][\w-]*$/.test(tag)) {
        const id = `${file}:${node.getStart(source)}`;
        const at = opening.attributes.end;
        inserts.push({ at, text: ` data-uiux-id=${JSON.stringify(id)}` });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const insert of inserts.sort((a, b) => b.at - a.at))
    code = code.slice(0, insert.at) + insert.text + code.slice(insert.at);
  return code;
}

export function bridgeSource(parentOrigin: string): string {
  return `(() => {
    const parentOrigin = ${JSON.stringify(parentOrigin)};
    parent.postMessage({type:'uiux:loading'},parentOrigin);
    let mode = 'design', selected = null, selectedMany = [], dragState = null;
    let movablePositions=[];
    const cursorMarked=new Map();
    const cursorStyle=document.createElement('style');
    cursorStyle.textContent='[data-uiux-movable="true"], [data-uiux-movable="true"] * { cursor: move !important; }';
    document.head.append(cursorStyle);
    const updateCursors=()=>{
      cursorMarked.forEach((previous,el)=>previous===null?el.removeAttribute('data-uiux-movable'):el.setAttribute('data-uiux-movable',previous));
      cursorMarked.clear();
      if(mode==='design')movablePositions.forEach(value=>{const el=findPosition(value);if(el&&!cursorMarked.has(el)){cursorMarked.set(el,el.getAttribute('data-uiux-movable'));el.setAttribute('data-uiux-movable','true')}});
    };
    const outline = document.createElement('div');
    outline.setAttribute('aria-hidden', 'true');
    outline.dataset.uiuxSelection='primary';
    Object.assign(outline.style, {position:'fixed',pointerEvents:'none',zIndex:'2147483647',border:'3px solid #5B42FF',borderRadius:'4px',background:'rgba(91,66,255,.10)',boxShadow:'0 0 0 3px rgba(91,66,255,.22),0 3px 12px rgba(38,24,110,.22)',display:'none',boxSizing:'border-box'});
    const selectionLabel=document.createElement('span');
    selectionLabel.textContent='✓ SELECTED';
    Object.assign(selectionLabel.style,{position:'absolute',left:'-3px',top:'-24px',padding:'3px 7px',borderRadius:'4px 4px 0 0',background:'#5B42FF',color:'#fff',font:'600 10px/15px system-ui,sans-serif',letterSpacing:'.04em',whiteSpace:'nowrap'});
    outline.append(selectionLabel);
    const hoverOutline=document.createElement('div');
    hoverOutline.setAttribute('aria-hidden','true');hoverOutline.dataset.uiuxSelection='hover';
    Object.assign(hoverOutline.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483645',border:'2px dotted #8B7CFF',borderRadius:'3px',display:'none',boxSizing:'border-box'});
    let hovered=null;
    const visualGroup = el => {
      let node = el;
      let best = el;
      for (let depth = 0; depth < 4 && node?.parentElement; depth += 1) {
        node = node.parentElement;
        if (!node || node === document.body) break;
        const hasLabel = !!node.querySelector('label');
        const hasControl = !!node.querySelector('input,select,textarea,button,[role="combobox"]');
        const r = node.getBoundingClientRect();
        if (hasLabel && hasControl && r.width > 0 && r.height > 0 && r.width < innerWidth * 0.8 && r.height < innerHeight * 0.6) best = node;
      }
      return best;
    };
    const attach = () => { if (!outline.parentNode) document.documentElement.append(outline);if(!hoverOutline.parentNode)document.documentElement.append(hoverOutline); };
    const show = el => { attach(); if (!el || mode !== 'design') {outline.style.display='none'; return;} const r=visualGroup(el).getBoundingClientRect();selectionLabel.style.top=r.top<26?'0px':'-24px';Object.assign(outline.style,{display:'block',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'}); };
    const showHover = el => {attach();hovered=el;if(!el||el===selected||mode!=='design'){hoverOutline.style.display='none';return;}const r=visualGroup(el).getBoundingClientRect();Object.assign(hoverOutline.style,{display:'block',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});};
    let multiOutlines=[];
    const showMany = () => {
      multiOutlines.forEach(item=>item.remove());multiOutlines=[];
      if(mode!=='design')return;
      selectedMany.filter(el=>el&&el!==selected).forEach(el=>{
        const marker=document.createElement('div');
        marker.setAttribute('aria-hidden','true');
        const r=visualGroup(el).getBoundingClientRect();
        marker.dataset.uiuxSelection='additional';
        Object.assign(marker.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483646',border:'2px dashed #8B5CF6',borderRadius:'3px',background:'rgba(139,92,246,.06)',boxSizing:'border-box',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
        document.documentElement.append(marker);multiOutlines.push(marker);
      });
    };
    const sourcePosition = el => {
      const elementId=el?.getAttribute('data-uiux-id');
      if(!elementId)return {elementId:null,instanceIndex:-1};
      const matches=Array.from(document.querySelectorAll('[data-uiux-id]')).filter(candidate=>candidate.getAttribute('data-uiux-id')===elementId);
      const rect=el.getBoundingClientRect();
      const identity={}; for(const name of ['id','name','aria-label']){const value=el.getAttribute(name);if(value!==null)identity[name]=value.slice(0,500);}
      return {elementId,instanceIndex:matches.indexOf(el),renderedText:(el.textContent||'').trim().slice(0,500),identity,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}};
    };
    const findPosition = value => {
      const matches=Array.from(document.querySelectorAll('[data-uiux-id]')).filter(el=>el.getAttribute('data-uiux-id')===value?.elementId);
      const index=Number(value?.instanceIndex);
      return Number.isInteger(index)&&index>=0?matches[index]||matches[0]:matches[0];
    };
    const choose = (el,additive=false) => {
      if(!el)return;
      const existing=selectedMany.indexOf(el);
      const isSelected=!additive||existing<0;
      if(!additive)selectedMany=[el];
      else if(existing>=0)selectedMany.splice(existing,1);
      else selectedMany.push(el);
      selected=isSelected?el:(selectedMany.at(-1)||null);
      show(selected);showMany();
      parent.postMessage({type:'uiux:select',...sourcePosition(el),additive,selected:isSelected},parentOrigin);
    };
    let marquee = null;
    const startMarquee = event => {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;border:1px dashed #635bff;background:rgba(99,91,255,.12);pointer-events:none;z-index:2147483646;left:0;top:0;width:0;height:0';
      document.body.appendChild(box);
      marquee = { x: event.clientX, y: event.clientY, box, additive: event.ctrlKey || event.metaKey || event.shiftKey };
      event.preventDefault();
    };
    const updateMarquee = event => {
      if (!marquee) return;
      const x = Math.min(marquee.x, event.clientX), y = Math.min(marquee.y, event.clientY);
      marquee.box.style.left = x + 'px'; marquee.box.style.top = y + 'px';
      marquee.box.style.width = Math.abs(event.clientX - marquee.x) + 'px';
      marquee.box.style.height = Math.abs(event.clientY - marquee.y) + 'px';
    };
    const finishMarquee = event => {
      if (!marquee) return;
      const state = marquee; marquee = null; state.box.remove();
      const left = Math.min(state.x, event.clientX), top = Math.min(state.y, event.clientY);
      const right = Math.max(state.x, event.clientX), bottom = Math.max(state.y, event.clientY);
      if (right - left < 4 || bottom - top < 4) return;
      const items = Array.from(document.querySelectorAll('[data-uiux-id]')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top;
      }).map(el => ({ ...sourcePosition(el), additive: state.additive, selected: true }));
      if (items.length) parent.postMessage({ type: 'uiux:marquee', items, additive: state.additive }, parentOrigin);
    };
    const beginDrag = (event,el) => {
      if(!el||event.button!==0)return;
      const additive=event.ctrlKey||event.metaKey;
      const keepGroup=!additive&&selectedMany.length>1&&selectedMany.includes(el);
      if(additive)choose(el,true);
      else if(!keepGroup)choose(el,false);
      else {selected=el;show(selected);showMany();}
      const items=(selectedMany.includes(el)?selectedMany:[el]).filter(Boolean).map(item=>{const dragEl=visualGroup(item);return {el:dragEl,transform:dragEl.style.transform,transition:dragEl.style.transition};});
      dragState={x:event.clientX,y:event.clientY,items,moved:false,keepGroup,target:el};
      try {event.target.setPointerCapture?.(event.pointerId);} catch {}
    };
    const block = event => {
      if(mode!=='design')return;
      if(event.type==='keydown' && !['Enter',' ','Escape'].includes(event.key))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(event.type==='pointerdown'){
        const target=event.target.closest?.('[data-uiux-id]');
        if(target) beginDrag(event,target); else startMarquee(event);
      }
      if(event.type==='keydown'&&event.key==='Escape')choose(selected?.parentElement?.closest('[data-uiux-id]'));
    };
    ['click','dblclick','pointerdown','mousedown','mouseup','touchstart','submit','beforeinput','change','keydown'].forEach(type=>window.addEventListener(type,block,true));
    window.addEventListener('pointermove',event=>{
      if(mode!=='design')return;
      if(marquee){ updateMarquee(event); return; }
      if(!dragState)return;
      const dx=Math.round(event.clientX-dragState.x),dy=Math.round(event.clientY-dragState.y);
      if(!dragState.moved&&Math.abs(dx)+Math.abs(dy)<4)return;
      event.preventDefault();event.stopImmediatePropagation();dragState.moved=true;
      dragState.items.forEach(item=>{item.el.style.transition='none';item.el.style.transform=(item.transform?item.transform+' ':'')+'translate('+dx+'px,'+dy+'px)';});
      show(selected);showMany();
    },true);
    window.addEventListener('pointerup',event=>{
      if(marquee){ finishMarquee(event); return; }
      if(!dragState)return;
      const state=dragState;dragState=null;
      const dx=Math.round(event.clientX-state.x),dy=Math.round(event.clientY-state.y);
      if(!(state.moved&&(dx||dy))) state.items.forEach(item=>{item.el.style.transform=item.transform;item.el.style.transition=item.transition;});
      show(selected);showMany();
      if(state.moved&&(dx||dy)){
        event.preventDefault();event.stopImmediatePropagation();
        parent.postMessage({type:'uiux:move',...sourcePosition(state.target),dx,dy},parentOrigin);
      } else if(state.keepGroup) choose(state.target,false);
    },true);
    window.addEventListener('keydown',event=>{
      if(mode!=='design')return;
      if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&event.key.toLowerCase()==='z'){
        event.preventDefault();event.stopImmediatePropagation();
        parent.postMessage({type:'uiux:undo'},parentOrigin);return;
      }
      if(selected&&!event.repeat&&['Delete','Backspace'].includes(event.key)){
        event.preventDefault();event.stopImmediatePropagation();
        parent.postMessage({type:'uiux:delete',...sourcePosition(selected)},parentOrigin);return;
      }
      if(!selected||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      parent.postMessage({type:'uiux:nudge',...sourcePosition(selected),direction:event.key,fast:event.ctrlKey||event.metaKey},parentOrigin);
    },true);
    window.addEventListener('mouseover',e=>{if(mode==='design')showHover(e.target.closest?.('[data-uiux-id]'));},true);
    window.addEventListener('mouseout',()=>showHover(null),true);
    window.addEventListener('scroll',()=>{show(selected);showMany();showHover(hovered);},true);
    window.addEventListener('resize',()=>{show(selected);showMany();showHover(hovered);});
    window.addEventListener('dragover',event=>{
      if(mode!=='design')return;
      const target=event.target.closest?.('[data-uiux-id]');
      if(!target)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
      showHover(target);
    },true);
    window.addEventListener('drop',event=>{
      if(mode!=='design')return;
      const target=event.target.closest?.('[data-uiux-id]');
      if(!target)return;
      const transfer=event.dataTransfer;
      let tag=transfer?.getData('uiux/tag')||'';
      let componentId=transfer?.getData('uiux/component')||'';
      if(!tag&&!componentId){
        try {
          const fallback=JSON.parse(transfer?.getData('text/plain')||'{}');
          if(fallback.kind==='tag')tag=String(fallback.value||'');
          if(fallback.kind==='component')componentId=String(fallback.value||'');
        } catch {}
      }
      if(!tag&&!componentId)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selected=target;
      selectedMany=[target];
      show(selected);showMany();
      parent.postMessage({type:'uiux:drop',elementId:target.getAttribute('data-uiux-id'),tag,componentId},parentOrigin);
    },true);
    window.addEventListener('message',event=>{
      if(event.origin!==parentOrigin||event.source!==parent)return;
      if(event.data?.type==='uiux:mode'){mode=event.data.mode==='interact'?'interact':'design';show(selected);showMany();showHover(null);updateCursors();}
      if(event.data?.type==='uiux:select'){selected=findPosition(event.data);selectedMany=selected?[selected]:[];show(selected);showMany();}
      if(event.data?.type==='uiux:select-many'){
        selectedMany=(Array.isArray(event.data.selections)?event.data.selections:[]).map(findPosition).filter(Boolean);
        selected=findPosition(event.data.primary)||selectedMany.at(-1)||null;show(selected);showMany();
        movablePositions=(Array.isArray(event.data.selections)?event.data.selections:[]).filter(value=>value?.movable===true);updateCursors();
        if(Number.isSafeInteger(event.data.readyToken))parent.postMessage({type:'uiux:selection-applied',token:event.data.readyToken},parentOrigin);
      }
    });
    let failed = false;
    const reportError = value => {failed=true;parent.postMessage({type:'uiux:error',message:String(value?.message||value||'Preview runtime error').slice(0,300)},parentOrigin);};
    window.addEventListener('error',event=>{if(event.error||event.message)reportError(event.error||event.message);});
    window.addEventListener('unhandledrejection',event=>reportError(event.reason));
    const started = performance.now();
    const verifyRender = () => {
      if(failed)return;
      const rendered = document.querySelector('[data-uiux-id]');
      const overlay = document.querySelector('vite-error-overlay');
      if(rendered&&!overlay){parent.postMessage({type:'uiux:ready'},parentOrigin);return;}
      if(overlay||performance.now()-started>8000){reportError(overlay?.shadowRoot?.textContent||'No instrumented React elements rendered. Inspect the preview and project entry point.');return;}
      requestAnimationFrame(verifyRender);
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',verifyRender,{once:true});else verifyRender();
  })();`;
}

export function designNetworkGuardSource(): string {
  return `(() => {
    const mockPath = '/__uiux_design_api_mock';
    const blocked = (method, value) => {
      try {
        const url = new URL(String(value || ''), location.href);
        return url.origin !== location.origin || !/^(GET|HEAD)$/i.test(String(method || 'GET')) || /\\.SVC$/i.test(url.pathname);
      } catch { return true; }
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const method = init.method || (typeof input === 'object' && input?.method) || 'GET';
      const url = typeof input === 'string' || input instanceof URL ? input : input?.url;
      return blocked(method, url)
        ? nativeFetch(mockPath, { method: 'GET', credentials: 'same-origin' })
        : nativeFetch(input, init);
    };
    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async = true, user, password) {
      if (blocked(method, url)) {
        this.__uiuxOriginalUrl = String(url || '');
        return nativeOpen.call(this, 'GET', mockPath, async);
      }
      return nativeOpen.call(this, method, url, async, user, password);
    };
    const nativeBeacon = navigator.sendBeacon?.bind(navigator);
    if (nativeBeacon) navigator.sendBeacon = (url, data) =>
      blocked('POST', url) ? true : nativeBeacon(url, data);
    window.__UIUX_DESIGN_NETWORK_MOCKED__ = true;
  })();`;
}

export class ProjectPreview {
  private server: ViteDevServer | null = null;
  private patch: SourcePatch | null = null;
  private draftSources = new Map<string, string>();
  private cacheDirectory: string | null = null;
  private root = "";
  private report: AnalysisReport | null = null;
  private designTarget: DesignTarget | null = null;
  url: string | null = null;
  private async localModule(file: string, specifier: string) {
    if (!specifier.startsWith(".")) return null;
    const base = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), specifier),
    );
    const existing = new Set(this.report?.files.map((item) => item.file) || []);
    for (const candidate of [
      base,
      ...[".tsx", ".ts", ".jsx", ".js", ".mts", ".cts", ".mjs", ".cjs"].map(
        (extension) => base + extension,
      ),
      ...[".tsx", ".ts", ".jsx", ".js", ".mts", ".cts", ".mjs", ".cjs"].map(
        (extension) => `${base}/index${extension}`,
      ),
    ])
      if (existing.has(candidate)) return candidate;
    return null;
  }
  private async designProviders(targetFile: string) {
    if (!this.report) return [];
    const providers: { file: string; name: string }[] = [];
    const visited = new Set<string>();
    const added = new Set<string>();
    const inspect = async (file: string): Promise<void> => {
      if (visited.has(file)) return;
      visited.add(file);
      const analyzed = this.report!.files.find((item) => item.file === file);
      if (!analyzed) return;
      for (const imported of analyzed.imports) {
        if (!/^use[A-Z]/.test(imported.name) || !imported.resolved) continue;
        await inspect(imported.resolved);
        const hookAnalysis = this.report!.files.find(
          (item) => item.file === imported.resolved,
        );
        if (!hookAnalysis) continue;
        const hookSource = await readProjectFile(this.root, imported.resolved);
        const hookFile = parseSource(imported.resolved, hookSource);
        const contexts = new Set<string>();
        const findContexts = (node: ts.Node) => {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === "useContext" &&
            node.arguments[0] &&
            ts.isIdentifier(node.arguments[0])
          )
            contexts.add(node.arguments[0].text);
          ts.forEachChild(node, findContexts);
        };
        findContexts(hookFile);
        for (const contextName of contexts) {
          const contextImport = hookAnalysis.imports.find(
            (item) => item.name === contextName && item.resolved,
          );
          if (!contextImport?.resolved) continue;
          const expected = contextName.replace(/Context$/, "Provider");
          const candidates = this.report!.components.filter(
            (component) =>
              component.source.file === contextImport.resolved &&
              component.exported &&
              component.name.endsWith("Provider"),
          );
          const provider =
            candidates.find((component) => component.name === expected) ??
            candidates[0];
          if (!provider || added.has(provider.id)) continue;
          await inspect(provider.source.file);
          added.add(provider.id);
          providers.push({
            file: provider.source.file,
            name: provider.name,
          });
        }
      }
    };
    await inspect(targetFile);
    return providers;
  }
  private async designSideEffects() {
    if (!this.report) return [];
    const html = await readProjectFile(this.root, "index.html");
    const entry = html.match(
      /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/i,
    )?.[1];
    if (!entry) return [];
    const entryFile = entry.replace(/^\.\//, "").replace(/^\//, "");
    const entrySource = await readProjectFile(this.root, entryFile);
    const sf = parseSource(entryFile, entrySource);
    const effects: string[] = [];
    for (const statement of sf.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        statement.importClause ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue;
      const resolved = await this.localModule(
        entryFile,
        statement.moduleSpecifier.text,
      );
      if (resolved) effects.push(resolved);
    }
    return effects;
  }
  private async designModule() {
    if (!this.designTarget) throw new Error("No design component selected.");
    const target = this.designTarget;
    const providers = await this.designProviders(target.file);
    const sideEffects = await this.designSideEffects();
    const imports = sideEffects.map((file) => `import "/${file}";`);
    providers.forEach((provider, index) =>
      imports.push(
        `import { ${provider.name} as Provider${index} } from "/${provider.file}";`,
      ),
    );
    imports.push(
      target.defaultExported
        ? `import Target from "/${target.file}";`
        : `import { ${target.componentName} as Target } from "/${target.file}";`,
    );
    const open = providers.map((_, index) => `<Provider${index}>`).join("");
    const close = providers
      .map((_, index) => `</Provider${providers.length - index - 1}>`)
      .join("");
    return `import React from "react";
import { createRoot } from "react-dom/client";
${imports.join("\n")}
class DesignBoundary extends React.Component {
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return {error};}
  render(){return this.state.error ? <pre style={{padding:24,color:"#b42318",whiteSpace:"pre-wrap"}}>{String(this.state.error?.stack||this.state.error)}</pre> : this.props.children;}
}
createRoot(document.getElementById("root")).render(
  <DesignBoundary>${open}<Target viewCd=${JSON.stringify(target.componentName)} />${close}</DesignBoundary>
);`;
  }
  async start(report: AnalysisReport, studioOrigin: string) {
    await this.stop();
    if (report.detected.framework === "nextjs")
      throw new Error(
        "Next.js supports static analysis in this version. Runtime selection requires a Next adapter; use the project dev server separately.",
      );
    if (!["vite-react", "react"].includes(report.detected.framework))
      throw new Error(
        "Instrumented preview requires a React project with an index.html entry. Static inspection is still available.",
      );
    await fs.access(path.join(report.projectRoot, "index.html"));
    this.root = report.projectRoot;
    this.report = report;
    this.designTarget = null;
    const toolRequire = createRequire(import.meta.url);
    const projectRequire = createRequire(path.join(this.root, "package.json"));
    const aliases: Record<string, string> = {};
    const runtimePaths: string[] = [];
    const warnings = [
      "Approved app preview source executes locally and may make network requests on mount. Isolated component Design mocks fetch/XHR service requests; other application side effects may still run.",
      "Preview uses the built-in Vite adapter; project scripts, Vite/PostCSS config files and lifecycle hooks are not executed. Custom plugins may need the project’s own dev server.",
    ];
    for (const name of ["react", "react-dom"]) {
      let packageFile: string;
      try {
        packageFile = projectRequire.resolve(`${name}/package.json`);
      } catch {
        packageFile = toolRequire.resolve(`${name}/package.json`);
        warnings.push(
          `${name} is provided by the studio for this preview; install the generated project’s dependencies before standalone use.`,
        );
      }
      aliases[name] = path.dirname(packageFile);
      runtimePaths.push(aliases[name]);
    }
    for (const [key, paths] of Object.entries(report.detected.aliases)) {
      const wildcard = key.endsWith("/*");
      if (
        !key ||
        key === "react" ||
        key === "react-dom" ||
        (key.includes("*") && (!wildcard || key.slice(0, -2).includes("*")))
      ) {
        warnings.push(
          `Ignored alias ${key}: the name is reserved or its wildcard is unsupported.`,
        );
        continue;
      }
      const aliasKey = wildcard ? key.slice(0, -2) : key;
      let resolved = false;
      for (const rawTarget of paths) {
        const targetWildcard = rawTarget.endsWith("/*");
        if (
          rawTarget.includes("*") &&
          (!targetWildcard || rawTarget.slice(0, -2).includes("*"))
        )
          continue;
        if (wildcard !== targetWildcard) continue;
        const aliasTarget = targetWildcard ? rawTarget.slice(0, -2) : rawTarget;
        try {
          const candidate = await fs.realpath(
            path.resolve(this.root, aliasTarget),
          );
          if (
            candidate === this.root ||
            candidate.startsWith(this.root + path.sep)
          ) {
            aliases[aliasKey] = candidate;
            resolved = true;
            break;
          }
        } catch {
          /* Try the next configured target. */
        }
      }
      if (!resolved)
        warnings.push(
          `Ignored alias ${key}: no configured target resolved safely inside the project.`,
        );
    }
    const owner = this;
    const designModuleId = designModulePath(this.root);
    this.cacheDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "react-uiux-preview-"),
    );
    const plugin: Plugin = {
      name: "react-uiux-dev-source-map",
      enforce: "pre",
      resolveId(id) {
        if (id === "/__uiux_design.jsx") return designModuleId;
      },
      async load(id) {
        if (id === designModuleId) return await owner.designModule();
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const requestPath = req.url?.split("?")[0];
          if (
            requestPath === "/__uiux_design_api_mock" &&
            owner.designTarget
          ) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(
              JSON.stringify({
                __uiuxMock: true,
                output: { grid01: [] },
                SysInfo: {},
                Account: {},
                EtcInfo: {},
              }),
            );
            return;
          }
          if (requestPath === "/__uiux_bridge.js") {
            res.setHeader("Content-Type", "text/javascript");
            res.setHeader("Cache-Control", "no-store");
            res.end(
              (owner.designTarget ? designNetworkGuardSource() : "") +
                bridgeSource(studioOrigin),
            );
            return;
          }
          next();
        });
      },
      transformIndexHtml(html) {
        const next = owner.designTarget
          ? html.replace(
              /<script\b[^>]*\btype=["']module["'][^>]*>[\s\S]*?<\/script>/gi,
              "",
            )
          : html;
        const tags: HtmlTagDescriptor[] = [
          {
            tag: "script",
            attrs: { src: "/__uiux_bridge.js" },
            injectTo: "head-prepend",
          },
        ];
        if (owner.designTarget)
          tags.push({
            tag: "script",
            attrs: { type: "module", src: "/__uiux_design.jsx" },
            injectTo: "body",
          });
        return { html: next, tags };
      },
      async transform(code, id) {
        const absolute = id.split("?")[0];
        if (!/\.[jt]sx$/.test(absolute) || absolute.includes("/node_modules/"))
          return null;
        const file = path
          .relative(owner.root, absolute)
          .split(path.sep)
          .join("/");
        if (file.startsWith("../") || path.isAbsolute(file)) return null;
        if (owner.draftSources.has(file)) code = owner.draftSources.get(file)!;
        else if (owner.patch?.file === file) code = owner.patch.after;
        return { code: instrumentSource(code, file), map: null };
      },
    };
    try {
      this.server = await createServer({
        configFile: false,
        root: this.root,
        envFile: false,
        cacheDir: this.cacheDirectory,
        plugins: [plugin],
        resolve: { alias: aliases },
        css: { postcss: { plugins: [] } },
        server: {
          host: "127.0.0.1",
          port: 0,
          strictPort: true,
          cors: false,
          fs: { strict: true, allow: [this.root, ...runtimePaths] },
        },
        oxc: { jsx: { runtime: "automatic" } },
        clearScreen: false,
        logLevel: "error",
      });
      await this.server.listen();
      const address = this.server.httpServer!.address();
      if (!address || typeof address === "string")
        throw new Error("Preview failed to bind a loopback port");
      this.url = `http://127.0.0.1:${address.port}`;
      return { url: this.url, kind: "instrumented-vite", warnings };
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  async overlay(patch: SourcePatch | null) {
    this.patch = patch;
    this.draftSources.clear();
    if (!this.server) return;
    this.server.moduleGraph.invalidateAll();
    this.server.ws.send({ type: "full-reload", path: "*" });
  }
  async draftOverlay(sources: ReadonlyMap<string, string>) {
    this.patch = null;
    this.draftSources = new Map(sources);
    if (!this.server) return;
    // Vite's React adapter does not reliably accept a synthetic js-update for the
    // transformed entry graph, so refresh the preview rather than leaving stale DOM.
    this.server.moduleGraph.invalidateAll();
    this.server.ws.send({ type: "full-reload", path: "*" });
  }

  async design(target: DesignTarget | null) {
    if (!this.server) throw new Error("Start the approved preview first.");
    if (target) {
      const component = this.report?.components.find(
        (item) =>
          item.source.file === target.file &&
          item.name === target.componentName,
      );
      if (!component)
        throw new Error("The selected design component is no longer indexed.");
      if (!component.exported)
        throw new Error(
          "This component is private to its source module and cannot be opened in an isolated design. Select its exported owner instead.",
        );
      this.designTarget = {
        file: component.source.file,
        componentName: component.name,
        defaultExported: !!component.defaultExported,
      };
    } else this.designTarget = null;
    this.server.moduleGraph.invalidateAll();
    this.server.ws.send({ type: "full-reload", path: "*" });
    return {
      target: this.designTarget,
      providers: this.designTarget
        ? await this.designProviders(this.designTarget.file)
        : [],
    };
  }
  async stop() {
    if (this.server) await this.server.close();
    const cacheDirectory = this.cacheDirectory;
    this.server = null;
    this.patch = null;
    this.report = null;
    this.designTarget = null;
    this.url = null;
    this.cacheDirectory = null;
    if (cacheDirectory)
      await fs.rm(cacheDirectory, { recursive: true, force: true });
  }
}
