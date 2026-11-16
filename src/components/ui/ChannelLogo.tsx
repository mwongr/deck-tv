
'use client';

import { useState, useEffect } from 'react';
import { Radio } from 'lucide-react';

interface ChannelLogoProps {
    src?: string;
    alt?: string;
    className?: string;
    fallbackClassName?: string;
}

export function ChannelLogo({ src, alt = "", className = "w-full h-full object-contain", fallbackClassName = "w-6 h-6 text-foreground-muted" }: ChannelLogoProps) {
    const [imgSrc, setImgSrc] = useState<string | undefined>(src);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setImgSrc(src);
        setHasError(false);
    }, [src]);

    const handleError = () => {
        if (!hasError && imgSrc && !imgSrc.startsWith('/api/proxy')) {
            // Try proxying the image
            setImgSrc(`/api/proxy?url=${encodeURIComponent(src || '')}`);
            setHasError(true);
        } else {
            // Proxy also failed, or it was already a proxy url
            setImgSrc(undefined);
        }
    };

    if (!imgSrc) {
        return <Radio className={fallbackClassName} />;
    }

    return (
        <img
            src={imgSrc}
            alt={alt}
            className={className}
            onError={handleError}
        />
    );
}
