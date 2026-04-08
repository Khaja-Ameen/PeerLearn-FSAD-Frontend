import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8080/api',
    headers: {
        'Content-Type': 'application/json'
    }
});

const normalizeUploadUrl = (value) => {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';

    const fileNameFromPath = (pathLike) => {
        const cleaned = String(pathLike || '')
            .replace(/^file:\/\/\//i, '')
            .replace(/\\/g, '/');
        const parts = cleaned.split('/').filter(Boolean);
        return parts.length ? parts[parts.length - 1] : '';
    };

    try {
        const baseUrl = new URL(api.defaults.baseURL || 'http://localhost:8080/api');
        const origin = baseUrl.origin;

        if (/^https?:\/\//i.test(trimmed)) {
            const malformedFileUrl = trimmed.match(/\/file:\/\/\/(.+)$/i);
            if (malformedFileUrl?.[1]) {
                const fileName = fileNameFromPath(malformedFileUrl[1]);
                return fileName ? `${origin}/uploads/${encodeURIComponent(fileName)}` : trimmed;
            }
            return trimmed;
        }

        if (/^file:\/\//i.test(trimmed) || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
            const fileName = fileNameFromPath(trimmed);
            return fileName ? `${origin}/uploads/${encodeURIComponent(fileName)}` : '';
        }

        if (trimmed.startsWith('/uploads/')) {
            return `${origin}${trimmed}`;
        }

        if (trimmed.startsWith('uploads/')) {
            return `${origin}/${trimmed}`;
        }

        return new URL(trimmed, origin).href;
    } catch (error) {
        return trimmed;
    }
};

export const getSubmissionAttachment = (submission) => {
    const source = submission || {};
    const nestedSubmission = source.submission || source.submissionData || {};

    const url = normalizeUploadUrl(
        source.fileUrl ||
        source.attachmentUrl ||
        source.submissionFileUrl ||
        source.submissionFilePath ||
        source.submission_file_path ||
        source.uploadedFileUrl ||
        source.filePath ||
        source.file_path ||
        source.attachmentPath ||
        source.attachment_path ||
        source.file ||
        source.path ||
        nestedSubmission.fileUrl ||
        nestedSubmission.attachmentUrl ||
        nestedSubmission.submissionFileUrl ||
        nestedSubmission.filePath ||
        nestedSubmission.file_path ||
        nestedSubmission.attachmentPath ||
        nestedSubmission.attachment_path ||
        nestedSubmission.path ||
        ''
    );

    const name =
        source.fileName ||
        source.attachmentName ||
        source.submissionFileName ||
        source.submission_file_name ||
        source.originalFileName ||
        source.originalFilename ||
        source.fileOriginalName ||
        source.file_name ||
        nestedSubmission.fileName ||
        nestedSubmission.attachmentName ||
        nestedSubmission.originalFileName ||
        nestedSubmission.originalFilename ||
        nestedSubmission.file_name ||
        source.name ||
        (url ? url.split('/').pop() : '');

    const mimeType = String(
        source.mimeType ||
        source.fileType ||
        source.contentType ||
        source.fileContentType ||
        source.mime_type ||
        source.content_type ||
        nestedSubmission.mimeType ||
        nestedSubmission.fileType ||
        nestedSubmission.contentType ||
        nestedSubmission.fileContentType ||
        nestedSubmission.mime_type ||
        nestedSubmission.content_type ||
        ''
    ).toLowerCase();

    const isImage = Boolean(
        mimeType.startsWith('image/') ||
        /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name || url)
    );

    return { url, name, isImage };
};

// Automatically attach JWT token to every request
api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 errors (token expired) — redirect to login
api.interceptors.response.use(
    response => response,
    error => {
        const requestUrl = String(error?.config?.url || '');
        const isAuthRequest = requestUrl.includes('/auth/');

        if (error.response && error.response.status === 401 && !isAuthRequest) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

export default api;