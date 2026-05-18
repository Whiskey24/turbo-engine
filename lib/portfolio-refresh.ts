import { useEffect } from "react";

export const PORTFOLIO_DATA_CHANGED = "turbo-engine:portfolio-data-changed";

export function refreshPortfolioViews() {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(PORTFOLIO_DATA_CHANGED));
    }
}

export function usePortfolioDataRefresh(onRefresh: () => void | Promise<void>) {
    useEffect(() => {
        void onRefresh();

        const handler = () => {
            void onRefresh();
        };

        window.addEventListener(PORTFOLIO_DATA_CHANGED, handler);
        return () => window.removeEventListener(PORTFOLIO_DATA_CHANGED, handler);
    }, [onRefresh]);
}
