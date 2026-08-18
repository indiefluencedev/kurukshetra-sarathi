import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // When routing, we scroll to top instantly to prevent the user from seeing
    // the page "scroll up" smoothly due to the global scroll-behavior: smooth.
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    // Restore smooth scrolling after a tiny delay so normal anchor links stay smooth
    setTimeout(() => {
      document.documentElement.style.scrollBehavior = "smooth";
    }, 50);
  }, [pathname]);

  return null;
}
