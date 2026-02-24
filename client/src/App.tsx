import { useState, useEffect } from 'react';
import { Loader2, Download, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface AnalyzeResponse {
  success: boolean;
  filename?: string;
  content?: string;
  error?: string;
  existingLlmsTxtDetected?: boolean;
}

function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ filename: string; content: string; existingLlmsTxtDetected?: boolean } | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial dark mode preference
    if (document.documentElement.classList.contains('dark')) {
      setIsDark(true);
    }
  }, []);

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }

    try {
      new URL(targetUrl);
    } catch {
      setError('Please enter a valid URL.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = (await response.json()) as AnalyzeResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to analyze website.');
      }

      setResult({
        filename: data.filename || 'llms.txt',
        content: data.content || '',
        existingLlmsTxtDetected: data.existingLlmsTxtDetected,
      });
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([result.content], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    const bUrl = URL.createObjectURL(blob);
    link.setAttribute('href', bUrl);
    link.setAttribute('download', result.filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <nav className="container mx-auto px-6 py-6 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center text-white shadow-lg">
            <span className="material-symbols-outlined">auto_awesome</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">AI Analyzer</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            onClick={toggleDarkMode}
          >
            <span className={`material-symbols-outlined ${isDark ? 'hidden' : 'block'}`}>dark_mode</span>
            <span className={`material-symbols-outlined ${isDark ? 'block' : 'hidden'}`}>light_mode</span>
          </button>
          <a className="px-5 py-2.5 font-medium text-sm text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors hidden sm:block" href="#">Docs</a>
          <a className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full font-semibold text-sm hover:scale-105 transition-transform active:scale-95" href="#">Get Started</a>
        </div>
      </nav>

      <main className="container mx-auto px-6 pt-20 pb-32 relative hero-gradient min-h-[calc(100vh-200px)]">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-4 border border-primary/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            New: Automatic LLM Discovery
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.1]">
            Optimize Your Site <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">for AI Agents</span>
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Crawl and automatically synthesize an optimized <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-primary font-mono text-sm">llms.txt</code> file to help AI models understand your content perfectly.
          </p>

          <div className="mt-12 max-w-3xl mx-auto">
            <form onSubmit={handleAnalyze} className="glass-card p-2 rounded-2xl shadow-2xl flex flex-col md:flex-row gap-2 transition-all duration-300 focus-within:ring-2 focus-within:ring-primary/50">
              <div className="flex-1 relative flex items-center">
                <span className="material-symbols-outlined absolute left-4 text-slate-400">link</span>
                <input
                  className="w-full bg-transparent border-none focus:ring-0 pl-12 pr-4 py-4 text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                  placeholder="Enter your website URL (e.g. example.com)"
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !url}
                className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white font-bold px-8 py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : <span className="material-symbols-outlined">search</span>}
                {isLoading ? 'Analyzing...' : 'Generate llms.txt'}
              </button>
            </form>

            {error && (
              <div className="mt-4 text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-300 p-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-sm">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <p className="mt-4 text-sm text-slate-500 dark:text-slate-500">No registration required. Try any public URL.</p>
          </div>
        </div>

        {/* Results Section */}
        {result && !isLoading && (
          <div className="mt-16 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className={`p-4 rounded-2xl mb-8 flex items-center gap-3 font-medium shadow-sm ${result.existingLlmsTxtDetected
                ? 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                : 'bg-amber-100/80 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
              }`}>
              <AlertCircle size={20} className={result.existingLlmsTxtDetected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} />
              {result.existingLlmsTxtDetected
                ? 'Great news! We found an existing llms.txt and optimized it for you.'
                : 'No llms.txt found. We synthesized one from scratch based on your website content!'}
            </div>

            <div className="glass-card rounded-3xl overflow-hidden shadow-2xl border-slate-200/50 dark:border-slate-700/50">
              <div className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-700/80 px-6 py-4 flex justify-between items-center backdrop-blur-sm">
                <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold tracking-tight">
                  <span className="material-symbols-outlined text-primary">description</span>
                  {result.filename}
                </div>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-600 transition-all border border-slate-200 dark:border-slate-600 shadow-sm hover:shadow-md active:scale-95"
                >
                  <Download size={16} />
                  Download
                </button>
              </div>

              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200/80 dark:divide-slate-700/80">
                <div className="p-6">
                  <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Preview</h3>
                  <div className="prose prose-slate dark:prose-invert prose-sm max-w-none max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                    <ReactMarkdown>{result.content}</ReactMarkdown>
                  </div>
                </div>
                <div className="p-6 bg-slate-50/30 dark:bg-slate-900/30">
                  <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Raw Text</h3>
                  <pre className="text-sm font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto pr-4 custom-scrollbar leading-relaxed">
                    {result.content}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Existing landing page content to show if not analyzing or result */}
        {!result && !isLoading && (
          <div className="animate-in fade-in duration-1000">
            <div className="mt-32">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Why do you need an <span className="text-primary italic">llms.txt</span> file?</h2>
                <p className="mt-4 text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                  As LLMs like ChatGPT and Claude increasingly index the web, they need clean, structured data to understand your website accurately. It's like SEO for AI.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="glass-card p-8 rounded-3xl hover:-translate-y-2 transition-transform duration-300 group shadow-sm hover:shadow-xl">
                  <div className="w-14 h-14 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-3xl">rocket_launch</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Boost AI Visibility</h3>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    Ensure your brand and key content are accurately prioritized in LLM responses and AI-generated summaries across the web.
                  </p>
                </div>
                <div className="glass-card p-8 rounded-3xl hover:-translate-y-2 transition-transform duration-300 group shadow-sm hover:shadow-xl">
                  <div className="w-14 h-14 bg-purple-500/10 text-purple-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-3xl">edit_note</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Control Your Narrative</h3>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    Explicitly define how AI should interpret your most important pages, products, or technical documentation.
                  </p>
                </div>
                <div className="glass-card p-8 rounded-3xl hover:-translate-y-2 transition-transform duration-300 group shadow-sm hover:shadow-xl">
                  <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-3xl">shield_check</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Reduce Hallucinations</h3>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    Provide noise-free, high-quality markdown to minimize the chance of AI making up false information about your site.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-24 bg-slate-900 dark:bg-slate-800 rounded-[2rem] p-12 text-white relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary blur-[120px] opacity-20 -mr-32 -mt-32"></div>
              <div className="grid md:grid-cols-2 gap-12 items-center relative z-10">
                <div>
                  <h2 className="text-3xl font-bold mb-6">Built for the future of browsing</h2>
                  <p className="text-slate-400 mb-8 leading-relaxed">
                    The web is changing. Users are no longer just clicking links; they're asking questions. We help you make sure the answers they get are the ones you want them to see.
                  </p>
                  <ul className="space-y-4">
                    <li className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary">check_circle</span>
                      <span>Auto-detection of site structure</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary">check_circle</span>
                      <span>Markdown optimization for context windows</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary">check_circle</span>
                      <span>Sitemap-to-LLM conversion</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-slate-800/50 dark:bg-slate-900/50 border border-slate-700 rounded-2xl p-6 font-mono text-sm overflow-hidden shadow-inner">
                  <div className="flex gap-2 mb-4 border-b border-slate-700 pb-4">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="ml-2 text-xs text-slate-500">llms.txt</span>
                  </div>
                  <div className="space-y-2 text-slate-300">
                    <div className="text-primary"># Summary</div>
                    <div>A powerful tool for AI optimization</div>
                    <div className="mt-4 text-primary"># Core Pages</div>
                    <div className="flex gap-4"><span>- [Pricing](/pricing)</span> <span className="text-slate-500">// Our plans</span></div>
                    <div className="flex gap-4"><span>- [Docs](/docs)</span> <span className="text-slate-500">// API references</span></div>
                    <div className="mt-4 text-primary"># Context</div>
                    <div>Built using modern Tailwind &amp; Next.js...</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 mt-10 py-12 relative z-10">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
            </div>
            <span className="font-bold text-slate-900 dark:text-white">AI Analyzer</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            © 2024 AI Analyzer. Helping websites speak AI.
          </p>
          <div className="flex gap-6">
            <a className="text-slate-400 hover:text-primary transition-colors" href="#"><span className="material-symbols-outlined">public</span></a>
            <a className="text-slate-400 hover:text-primary transition-colors" href="#"><span className="material-symbols-outlined">alternate_email</span></a>
            <a className="text-slate-400 hover:text-primary transition-colors" href="#"><span className="material-symbols-outlined">terminal</span></a>
          </div>
        </div>
      </footer>
    </>
  );
}

export default App;
