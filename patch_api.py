import re
import sys

try:
    with open('src/services/api.ts', 'r') as f:
        code = f.read()

    # Create safe base URL var
    if 'const API_BASE_URL' not in code:
        code = code.replace('export interface Team {', f"const API_BASE_URL = import.meta.env.VITE_API_URL || '';\\n\\nexport interface Team {{")

    # Replace fetch urls correctly
    code = code.replace("fetch('/api/", "fetch(`${API_BASE_URL}/api/")
    code = code.replace("fetch(`/api/", "fetch(`${API_BASE_URL}/api/")

    # Update getWsUrl export
    ws_old = re.search(r'export const getWsUrl = \(\) => \{.*?\};', code, re.DOTALL)
    if ws_old:
        ws_new = """export const getWsUrl = () => {
  if (API_BASE_URL) {
    const parsed = new URL(API_BASE_URL);
    const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${parsed.host}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}`;
};"""
        code = code.replace(ws_old.group(0), ws_new)
        
    with open('src/services/api.ts', 'w') as f:
        f.write(code)
    
    print("SUCCESS")
except Exception as e:
    print(f"Error: {e}")
