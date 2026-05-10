import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'framer-motion';
import { FaSync, FaShieldAlt, FaRocket } from 'react-icons/fa';

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
      // Continuous check for updates every 30 seconds
      if (r) {
        setInterval(() => {
          r.update();
        }, 30 * 1000);
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const handleUpdate = () => {
    // Set flags to show success message and FORCE full splash after reload
    localStorage.setItem('pwa_update_success', 'true');
    localStorage.setItem('force_full_splash', 'true');
    
    // updateServiceWorker(true) will set 'skipWaiting' and reload the page automatically
    updateServiceWorker(true);
  };

  useEffect(() => {
    if (localStorage.getItem('pwa_update_success') === 'true') {
      localStorage.removeItem('pwa_update_success');
      /*
      Swal.fire({
        icon: 'success',
        title: 'System Updated!',
        text: 'PPG EMP HUB has been synchronized with the latest server version.',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 5000,
        background: '#f0f9ff',
        color: '#0369a1',
        iconColor: '#0ea5e9'
      });
      */
    }
  }, []);

  return (
    <AnimatePresence>
      {needRefresh && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-sky-900/60 backdrop-blur-xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            className="bg-white rounded-[40px] shadow-2xl overflow-hidden max-w-sm w-full border border-sky-100"
          >
            <div className="bg-gradient-to-br from-sky-600 to-sky-700 p-8 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full opacity-10">
                <FaSync className="text-[150px] absolute -top-10 -left-10 animate-spin-slow" />
              </div>
              <div className="relative z-10">
                <div className="h-20 w-20 bg-white/20 backdrop-blur-md rounded-3xl mx-auto flex items-center justify-center mb-6 border border-white/30 shadow-xl">
                  <FaRocket className="text-white text-3xl animate-bounce" />
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight leading-tight">System Update Required</h2>
                <p className="text-sky-100 text-[9px] font-black mt-2 uppercase tracking-widest opacity-80">Security and Performance Sync</p>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-sky-50 rounded-2xl border border-sky-100">
                  <div className="mt-1 h-2 w-2 bg-sky-500 rounded-full shrink-0" />
                  <p className="text-[13px] font-bold text-sky-700 leading-relaxed">
                    A required update was detected. You must sync to the latest version to continue using the application.
                  </p>
                </div>
                <div className="flex items-start gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <FaShieldAlt className="mt-1 text-emerald-500 shrink-0" />
                  <p className="text-[13px] font-bold text-emerald-700 leading-relaxed">
                    Your data is safe. Syncing will take only a few seconds.
                  </p>
                </div>
              </div>

              <button
                onClick={handleUpdate}
                className="w-full py-5 bg-sky-600 hover:bg-sky-700 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-sky-200 transition-all active:scale-95 flex items-center justify-center gap-3 group"
              >
                <FaSync className="group-hover:rotate-180 transition-transform duration-500" />
                Synchronize Now
              </button>
              
              <div className="text-center">
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
                  Mandatory Update Required — Version Latest
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}


    </AnimatePresence>
  );
}

export default ReloadPrompt;
