import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

// Mock fetch globally
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

// Helper function to get the expected API URL (matches App.tsx behavior)
const getExpectedApiUrl = () => import.meta.env.VITE_API_URL || 'http://localhost:3000'

describe('App Component', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Component Mounting', () => {
    it('renders without crashing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText('AI Image Tagger')).toBeInTheDocument()
      })
    })

    it('renders the main heading', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<App />)
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /AI Image Tagger/i })).toBeInTheDocument()
      })
    })

    it('renders the subtitle', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText(/Serverless Image Analysis with AWS Rekognition/i)).toBeInTheDocument()
      })
    })

    it('renders the upload button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<App />)
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Upload Image/i })).toBeInTheDocument()
      })
    })

    it('renders hidden file input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const { container } = render(<App />)
      
      await waitFor(() => {
        const fileInput = container.querySelector('input[type="file"]')
        expect(fileInput).toBeInTheDocument()
        expect(fileInput).toHaveAttribute('accept', 'image/*')
      })
    })
  })

  describe('Gallery Component Integration', () => {
    it('renders the Gallery component', async () => {
      // Mock the /images endpoint to return empty array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<App />)
      
      // Wait for the Gallery to fetch and render
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })
    })

    it('Gallery component receives correct apiUrl', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<App />)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(`${getExpectedApiUrl()}/images`)
      })
    })
  })

  describe('File Upload Functionality', () => {
    it('triggers file input when upload button is clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const { container } = render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const clickSpy = vi.spyOn(fileInput, 'click')
      
      const button = screen.getByRole('button', { name: /Upload Image/i })
      fireEvent.click(button)
      
      expect(clickSpy).toHaveBeenCalled()
    })

    it('does not upload when no file is selected', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const { container } = render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      
      fireEvent.change(fileInput, { target: { files: [] } })
      
      // Should only have called fetch once for the initial Gallery fetch
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('successfully uploads a file with presigned URL', async () => {
      // Mock Gallery fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

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
      
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      // Wait for upload to complete
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3) // Gallery + presigned URL + S3 upload
      })
      
      // Verify presigned URL was fetched (2nd call, after Gallery)
      expect(mockFetch).toHaveBeenNthCalledWith(2, `${getExpectedApiUrl()}/upload-url`)
      
      // Verify file was uploaded to S3 (3rd call)
      expect(mockFetch).toHaveBeenNthCalledWith(3, 'https://s3.amazonaws.com/test-bucket/test-key', {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'image/jpeg',
        },
      })
    })

    it('shows uploading state during upload', async () => {
      // Mock Gallery fetch first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const { container } = render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })

      // Now mock the upload to never resolve
      mockFetch.mockImplementation(() => new Promise(() => {}))

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Uploading.../i })).toBeInTheDocument()
      })
      
      expect(screen.getByRole('button', { name: /Uploading.../i })).toBeDisabled()
    })

    it('handles presigned URL fetch error', async () => {
      // Mock Gallery fetch first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const { container } = render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })

      // Mock error for presigned URL fetch
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

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
      // Mock Gallery fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const { container } = render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })

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

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByText(/Upload failed: 403 Forbidden/i)).toBeInTheDocument()
      })
    })

    it('handles non-OK presigned URL response', async () => {
      // Mock Gallery fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const { container } = render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })

      // Mock error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByText(/Failed to get upload URL: 500 Internal Server Error/i)).toBeInTheDocument()
      })
    })

    it('resets file input after successful upload', async () => {
      // Mock /images endpoint for Gallery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      // Mock presigned URL response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/test-bucket/test-key',
          key: 'uploads/test-key.jpg',
          expiresIn: 300,
        }),
      })
      
      // Mock S3 upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const { container } = render(<App />)
      
      // Wait for initial Gallery fetch
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3) // Gallery + presigned URL + S3 upload
      })
      
      // File input should be reset
      expect(fileInput.value).toBe('')
    })

    it('shows success message after successful upload', async () => {
      // Mock /images endpoint for Gallery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      // Mock presigned URL response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/test-bucket/test-key',
          key: 'uploads/test-key.jpg',
          expiresIn: 300,
        }),
      })
      
      // Mock S3 upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const { container } = render(<App />)
      
      // Wait for initial Gallery fetch
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByText(/Upload successful! Processing image.../i)).toBeInTheDocument()
      })
    })

    it('refreshes gallery after successful upload', async () => {
      // Mock /images endpoint for initial Gallery fetch (empty)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      // Mock presigned URL response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/test-bucket/test-key',
          key: 'uploads/test-key.jpg',
          expiresIn: 300,
        }),
      })
      
      // Mock S3 upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      // Mock /images endpoint for Gallery refresh (with new image)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            imageId: 'uploads/test-key.jpg',
            s3Url: 'https://bucket.s3.amazonaws.com/uploads/test-key.jpg',
            labels: [{ name: 'Test', confidence: 95 }],
            timestamp: new Date().toISOString(),
          },
        ],
      })

      const { container } = render(<App />)
      
      // Wait for initial Gallery fetch (should show 0 images)
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      // Wait for gallery to refresh and show 1 image
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(1\)/i)).toBeInTheDocument()
      })

      // Verify fetch was called 4 times:
      // 1. Initial gallery fetch
      // 2. Presigned URL
      // 3. S3 upload
      // 4. Gallery refresh
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })

    it('uses correct API URL from environment variable', async () => {
      // Set environment variable
      import.meta.env.VITE_API_URL = 'https://api.example.com'
      
      // Mock Gallery fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      // Mock presigned URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/test-bucket/test-key',
          key: 'uploads/test-key.jpg',
          expiresIn: 300,
        }),
      })

      const { container } = render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })

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
      // Mock Gallery fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      // Mock presigned URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/test-bucket/test-key',
          key: 'uploads/test-key.jpg',
          expiresIn: 300,
        }),
      })
      
      // Mock S3 upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const { container } = render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
      
      const file = new File(['test'], 'test.jpg', { type: '' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3) // Gallery + presigned URL + S3 upload
      })
      
      expect(mockFetch).toHaveBeenNthCalledWith(3, expect.any(String), {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      })
    })
  })

  describe('Accessibility', () => {
    it('has proper semantic HTML structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<App />)
      
      await waitFor(() => {
        expect(screen.getByRole('banner')).toBeInTheDocument()
        expect(screen.getByRole('main')).toBeInTheDocument()
        expect(screen.getByRole('button')).toBeInTheDocument()
      })
    })

    it('headings are properly structured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<App />)
      
      await waitFor(() => {
        const h1 = screen.getByRole('heading', { level: 1 })
        const h2Elements = screen.getAllByRole('heading', { level: 2 })
        expect(h1).toBeInTheDocument()
        expect(h2Elements.length).toBeGreaterThan(0)
      })
    })

    it('information sections are in correct DOM order for screen readers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const { container } = render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText('Why This Project?')).toBeInTheDocument()
      })

      // Get all the main sections in DOM order
      const main = container.querySelector('main')
      expect(main).toBeInTheDocument()
      
      const sections = main?.children
      expect(sections).toBeDefined()
      
      // Verify order: Upload -> Gallery -> InfoBox -> ProjectDepth -> ProfessionalFooter
      // Upload section should be first (contains "Upload Image" button)
      expect(sections?.[0]).toHaveClass('upload-section')
      
      // Gallery should be second
      expect(sections?.[1]).toHaveTextContent('Your Images')
      
      // InfoBox should be third (contains "Why This Project?")
      expect(sections?.[2]).toHaveTextContent('Why This Project?')
      
      // ProjectDepth should be fourth (contains "Technical Depth")
      expect(sections?.[3]).toHaveTextContent('Technical Depth')
      
      // ProfessionalFooter should be last (contains "Stefan Schmidpeter")
      expect(sections?.[4]).toHaveTextContent('Stefan Schmidpeter')
    })
  })
})
