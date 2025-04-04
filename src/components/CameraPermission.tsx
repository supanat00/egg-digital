import React, { useEffect } from 'react';

interface CameraPermissionProps {
    onPermissionGranted: () => void;
}

const CameraPermission: React.FC<CameraPermissionProps> = ({ onPermissionGranted }) => {
    useEffect(() => {
        const requestPermission = async () => {
            try {
                // ขอสิทธิ์กล้องแบบ minimal
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                // หยุด stream ทันทีหลังจากได้รับ permission
                stream.getTracks().forEach(track => track.stop());
                onPermissionGranted();
            } catch (error) {
                console.error("Camera permission denied:", error);
            }
        };

        requestPermission();
    }, [onPermissionGranted]);

    return <div>Waiting for camera permission...</div>;
};

export default CameraPermission;
