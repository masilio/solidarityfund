import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/globals.css";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../lib/toast";

export default function App({ Component, pageProps }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </ToastProvider>
  );
}
