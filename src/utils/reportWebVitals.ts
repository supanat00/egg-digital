// import { ReportHandler } from 'web-vitals'; 

const reportWebVitals = (onPerfEntry?: (metric: any) => void) => {
    if (onPerfEntry && onPerfEntry instanceof Function) {
        import('web-vitals').then((module: any) => {
            const { getCLS, getFID, getFCP, getLCP, getTTFB } = module;
            getCLS(onPerfEntry);
            getFID(onPerfEntry);
            getFCP(onPerfEntry);
            getLCP(onPerfEntry);
            getTTFB(onPerfEntry);
        });
    }
};

export default reportWebVitals;
