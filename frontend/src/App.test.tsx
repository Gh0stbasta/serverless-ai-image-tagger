import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

// Mock fetch globally
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('App Component', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Component Mounting', () => {
    it('renders without crashing', () => {
      render(<App />)
      expect(screen.getByText('AI Image Tagger')).toBeInTheDocument()
    })

    it('renders the main heading', () => {
      render(<App />)
      expect(screen.getByRole('heading', { name: /AI Image Tagger/i })).toBeInTheDocument()
    })

    it('renders the subtitle', () => {
      render(<App />)
      expect(screen.getByText(/Serverless Image Analysis with AWS Rekognition/i)).toBeInTheDocument()
    })

    it('renders the upload button', () => {
      render(<App />)
      expect(screen.getByRole('button', { name: /Upload Image/i })).toBeInTheDocument()
    })

    it('renders hidden file input', () => {
      const { container } = render(<App />)
      const fileInput = container.querySelector('input[type="file"]')
      expect(fileInput).toBeInTheDocument()
      expect(fileInput).toHaveAttribute('accept', 'image/*')
    })
  })

  describe('Empty State Rendering', () => {
    it('displays empty state message when no images are present', () => {
      render(<App />)
      expect(screen.getByText(/No images yet. Upload one to get started!/i)).toBeInTheDocument()
    })

    it('displays correct image count (0) when empty', () => {
      render(<App />)
      expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
    })

    it('does not render the images grid when empty', () => {
      const { container } = render(<App />)
      expect(container.querySelector('.images-grid')).not.toBeInTheDocument()
    })
  })

  describe('File Upload Functionality', () => {
    it('triggers file input when upload button is clicked', () => {
      const { container } = render(<App />)
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const clickSpy = vi.spyOn(fileInput, 'click')
      
      const button = screen.getByRole('button', { name: /Upload Image/i })
      fireEvent.click(button)
      
      expect(clickSpy).toHaveBeenCalled()
    })

    it('does not upload when no file is selected', async () => {
      const { container } = render(<App />)
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      
      fireEvent.change(fileInput, { target: { files: [] } })
      
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('successfully uploads a file with presigned URL', async () => {
      // Mock successful presigned URL response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/test-bucket/test-key',
          key: 'uploads/test-key.jpg',
          expiresIn: 300,
        }),
      })
      
      // Mock successful S3 upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const { container } = render(<App />)
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      // Wait for upload to complete
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2)
      })
      
      // Verify presigned URL was fetched
      expect(mockFetch).toHaveBeenNthCalledWith(1, 'http://localhost:3000/upload-url')
      
      // Verify file was uploaded to S3
      expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://s3.amazonaws.com/test-bucket/test-key', {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'image/jpeg',
        },
      })
    })

    it('shows uploading state during upload', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves
      
      const { container } = render(<App />)
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Uploading.../i })).toBeInTheDocument()
      })
      
      expect(screen.getByRole('button', { name: /Uploading.../i })).toBeDisabled()
    })

    it('handles presigned URL fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      
      const { container } = render(<App />)
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument()
      })
      
      // Button should be re-enabled
      expect(screen.getByRole('button', { name: /Upload Image/i })).not.toBeDisabled()
    })

    it('handles S3 upload error', async () => {
      // Mock successful presigned URL response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/test-bucket/test-key',
          key: 'uploads/test-key.jpg',
          expiresIn: 300,
        }),
      })
      
      // Mock failed S3 upload
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })

      const { container } = render(<App />)
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByText(/Upload failed: 403 Forbidden/i)).toBeInTheDocument()
      })
    })

    it('handles non-OK presigned URL response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const { container } = render(<App />)
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByText(/Failed to get upload URL: 500 Internal Server Error/i)).toBeInTheDocument()
      })
    })

    it('resets file input after successful upload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/test-bucket/test-key',
          key: 'uploads/test-key.jpg',
          expiresIn: 300,
        }),
      })
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const { container } = render(<App />)
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2)
      })
      
      // File input should be reset
      expect(fileInput.value).toBe('')
    })

    it('uses correct API URL from environment variable', async () => {
      // Set environment variable
      import.meta.env.VITE_API_URL = 'https://api.example.com'
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/test-bucket/test-key',
          key: 'uploads/test-key.jpg',
          expiresIn: 300,
        }),
      })

      const { container } = render(<App />)
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/upload-url')
      })
      
      // Reset environment variable
      delete import.meta.env.VITE_API_URL
    })

    it('uses default Content-Type for files without type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/test-bucket/test-key',
          key: 'uploads/test-key.jpg',
          expiresIn: 300,
        }),
      })
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const { container } = render(<App />)
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      
      const file = new File(['test'], 'test.jpg', { type: '' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2)
      })
      
      expect(mockFetch).toHaveBeenNthCalledWith(2, expect.any(String), {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      })
    })
  })

  describe('Accessibility', () => {
    it('has proper semantic HTML structure', () => {
      render(<App />)
      expect(screen.getByRole('banner')).toBeInTheDocument()
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('headings are properly structured', () => {
      render(<App />)
      const h1 = screen.getByRole('heading', { level: 1 })
      const h2 = screen.getByRole('heading', { level: 2 })
      expect(h1).toBeInTheDocument()
      expect(h2).toBeInTheDocument()
    })
  })
})
