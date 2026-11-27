import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { SITE_FONT, MoreLink } from "@/components/site/siteUi";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div style={SITE_FONT} className="flex min-h-screen items-center justify-center bg-background px-6 antialiased">
      <div className="text-center">
        <p className="text-sm font-medium text-primary">Error 404</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.025em] text-foreground md:text-5xl">Page not found.</h1>
        <p className="mt-4 text-lg text-muted-foreground">The page you are looking for does not exist or was moved.</p>
        <div className="mt-8">
          <MoreLink to="/">Go to the home page</MoreLink>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
