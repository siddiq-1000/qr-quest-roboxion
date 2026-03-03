import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add autoComplete="off" to all generic inputs
code = re.sub(r'<(input|textarea)(?![^>]*autoComplete=)', r'<\1 autoComplete="off"', code)

# Insert the Toast State and component inside the App component
app_start = "export default function App() {\n"
toast_state = """  const [toasts, setToasts] = useState<{id: number, message: string, type: 'success' | 'error' | 'info'}[]>([]);
  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };\n\n"""

if "const [toasts, setToasts]" not in code:
    code = code.replace(app_start, app_start + toast_state)

# Replace alerts
code = code.replace("alert(`🎉 Notification: ${data.teamName} has completed all tasks!`);", "showToast(`🎉 Notification: ${data.teamName} has completed all tasks!`, 'success');")
code = code.replace("alert(err.message || 'Error updating sub-task');", "showToast(err.message || 'Error updating sub-task', 'error');")
code = code.replace("alert(err.message || 'Error deleting sub-task');", "showToast(err.message || 'Error deleting sub-task', 'error');")
code = code.replace("alert(err.message || 'Error submitting task');", "showToast(err.message || 'Error submitting task', 'error');")
code = code.replace("alert(err.message || 'Team ID already exist.');", "showToast(err.message || 'Team ID already exists.', 'error');")
code = code.replace("alert('URL copied to clipboard!');", "showToast('URL copied to clipboard!', 'success');")

# Render Toasts
root_end = """      </main>
    </div>
  );
}"""

toast_ui = """      </main>

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg ${
                t.type === 'error' ? 'bg-red-500 text-white' : 
                t.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-zinc-900 text-white'
              }`}
            >
              <span className="text-sm font-medium">{t.message}</span>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="ml-2 hover:opacity-70">
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </div>
  );
}"""

if "Toast Notifications" not in code:
    code = code.replace(root_end, toast_ui)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
