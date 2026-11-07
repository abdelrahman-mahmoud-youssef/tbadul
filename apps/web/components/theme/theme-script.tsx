export const themeStorageKey = 'theme';

const script = `(()=>{const r=document.documentElement;let t;try{t=localStorage.getItem('${themeStorageKey}')}catch{}r.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
