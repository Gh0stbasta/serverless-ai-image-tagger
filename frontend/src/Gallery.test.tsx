import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Gallery from './Gallery'

// Mock fetch globally
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('Gallery Component', () => {
  const mockApiUrl = 'http://localhost:3000'

  beforeEach(() => {
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Loading State', () => {
    it('displays loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves
      
      render(<Gallery apiUrl={mockApiUrl} />)
      
      expect(screen.getByText(/Loading images.../i)).toBeInTheDocument()
    })

    it('shows heading during loading', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))
      
      render(<Gallery apiUrl={mockApiUrl} />)
      
      expect(screen.getByRole('heading', { name: /Your Images/i })).toBeInTheDocument()
    })
  })

  describe('Data Fetching', () => {
    it('fetches images from correct endpoint on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(`${mockApiUrl}/images`)
      })
    })

    it('fetches images only once on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1)
      })
    })

    it('uses provided apiUrl for fetching', async () => {
      const customApiUrl = 'https://api.example.com'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<Gallery apiUrl={customApiUrl} />)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(`${customApiUrl}/images`)
      })
    })
  })

  describe('Empty State', () => {
    it('displays empty state when no images are returned', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(screen.getByText(/No images yet. Upload one to get started!/i)).toBeInTheDocument()
      })
    })

    it('shows image count of 0 in empty state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(screen.getByText(/Your Images \(0\)/i)).toBeInTheDocument()
      })
    })

    it('does not render gallery grid when empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const { container } = render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(container.querySelector('.gallery-grid')).not.toBeInTheDocument()
      })
    })
  })

  describe('Error State', () => {
    it('displays error message when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument()
      })
    })

    it('displays error when API returns non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch images: 500 Internal Server Error/i)).toBeInTheDocument()
      })
    })

    it('logs error to console when fetch fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled()
      })

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Gallery Grid Rendering', () => {
    const mockImages = [
      {
        imageId: 'uploads/test-image-1.jpg',
        s3Url: 'https://bucket.s3.amazonaws.com/uploads/test-image-1.jpg',
        labels: [
          { name: 'Dog', confidence: 95.5 },
          { name: 'Animal', confidence: 88.2 },
        ],
        timestamp: '2024-01-15T10:30:00.000Z',
      },
      {
        imageId: 'uploads/test-image-2.jpg',
        s3Url: 'https://bucket.s3.amazonaws.com/uploads/test-image-2.jpg',
        labels: [
          { name: 'Cat', confidence: 92.3 },
        ],
        timestamp: '2024-01-15T11:45:00.000Z',
      },
    ]

    it('displays correct image count in heading', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImages,
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(screen.getByText(/Your Images \(2\)/i)).toBeInTheDocument()
      })
    })

    it('renders gallery grid with correct number of cards', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImages,
      })

      const { container } = render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const cards = container.querySelectorAll('.gallery-card')
        expect(cards).toHaveLength(2)
      })
    })

    it('renders images with correct src attribute', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImages,
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const images = screen.getAllByRole('img')
        expect(images).toHaveLength(2)
        expect(images[0]).toHaveAttribute('src', mockImages[0].s3Url)
        expect(images[1]).toHaveAttribute('src', mockImages[1].s3Url)
      })
    })

    it('renders images with lazy loading', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImages,
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const images = screen.getAllByRole('img')
        images.forEach(img => {
          expect(img).toHaveAttribute('loading', 'lazy')
        })
      })
    })

    it('displays filename correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImages,
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(screen.getByText('test-image-1.jpg')).toBeInTheDocument()
        expect(screen.getByText('test-image-2.jpg')).toBeInTheDocument()
      })
    })

    it('displays formatted timestamps', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImages,
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const dates = screen.getAllByText(/Jan 15, 2024/i)
        expect(dates.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Label Badges', () => {
    const mockImageWithLabels = [
      {
        imageId: 'uploads/test-image.jpg',
        s3Url: 'https://bucket.s3.amazonaws.com/uploads/test-image.jpg',
        labels: [
          { name: 'Dog', confidence: 95.5 },
          { name: 'Animal', confidence: 82.0 },
          { name: 'Pet', confidence: 65.7 },
        ],
        timestamp: '2024-01-15T10:30:00.000Z',
      },
    ]

    it('renders all labels as badges', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImageWithLabels,
      })

      const { container } = render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const badges = container.querySelectorAll('.tag-badge')
        expect(badges).toHaveLength(3)
      })
    })

    it('displays label names and confidence percentages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImageWithLabels,
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(screen.getByText(/Dog 96%/i)).toBeInTheDocument()
        expect(screen.getByText(/Animal 82%/i)).toBeInTheDocument()
        expect(screen.getByText(/Pet 66%/i)).toBeInTheDocument()
      })
    })

    it('applies high confidence badge class for >=90%', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImageWithLabels,
      })

      const { container } = render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const highBadge = container.querySelector('.badge-high')
        expect(highBadge).toBeInTheDocument()
        expect(highBadge?.textContent).toContain('Dog')
      })
    })

    it('applies medium confidence badge class for 70-89%', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImageWithLabels,
      })

      const { container } = render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const mediumBadge = container.querySelector('.badge-medium')
        expect(mediumBadge).toBeInTheDocument()
        expect(mediumBadge?.textContent).toContain('Animal')
      })
    })

    it('applies low confidence badge class for <70%', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImageWithLabels,
      })

      const { container } = render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const lowBadge = container.querySelector('.badge-low')
        expect(lowBadge).toBeInTheDocument()
        expect(lowBadge?.textContent).toContain('Pet')
      })
    })

    it('includes confidence in badge title attribute', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImageWithLabels,
      })

      const { container } = render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const badges = container.querySelectorAll('.tag-badge')
        expect(badges[0]).toHaveAttribute('title', 'Confidence: 95.5%')
      })
    })
  })

  describe('Edge Cases', () => {
    it('handles image with no labels', async () => {
      const imageWithoutLabels = [
        {
          imageId: 'uploads/test-image.jpg',
          s3Url: 'https://bucket.s3.amazonaws.com/uploads/test-image.jpg',
          labels: [],
          timestamp: '2024-01-15T10:30:00.000Z',
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => imageWithoutLabels,
      })

      const { container } = render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const badges = container.querySelectorAll('.tag-badge')
        expect(badges).toHaveLength(0)
      })
    })

    it('handles very long filenames correctly', async () => {
      const imageWithLongName = [
        {
          imageId: 'uploads/very-long-filename-that-should-be-truncated-in-the-ui.jpg',
          s3Url: 'https://bucket.s3.amazonaws.com/uploads/very-long-filename.jpg',
          labels: [],
          timestamp: '2024-01-15T10:30:00.000Z',
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => imageWithLongName,
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(screen.getByText(/very-long-filename-that-should-be-truncated-in-the-ui.jpg/i)).toBeInTheDocument()
      })
    })

    it('handles imageId with path correctly', async () => {
      const imageWithPath = [
        {
          imageId: 'uploads/subfolder/test-image.jpg',
          s3Url: 'https://bucket.s3.amazonaws.com/uploads/subfolder/test-image.jpg',
          labels: [],
          timestamp: '2024-01-15T10:30:00.000Z',
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => imageWithPath,
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(screen.getByText('test-image.jpg')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('uses semantic HTML with section element', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const { container } = render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        expect(container.querySelector('section.gallery-section')).toBeInTheDocument()
      })
    })

    it('has proper heading hierarchy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const h2 = screen.getByRole('heading', { level: 2 })
        expect(h2).toBeInTheDocument()
      })
    })

    it('provides alt text for images', async () => {
      const mockImage = [
        {
          imageId: 'uploads/test-image.jpg',
          s3Url: 'https://bucket.s3.amazonaws.com/uploads/test-image.jpg',
          labels: [],
          timestamp: '2024-01-15T10:30:00.000Z',
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockImage,
      })

      render(<Gallery apiUrl={mockApiUrl} />)

      await waitFor(() => {
        const img = screen.getByRole('img')
        expect(img).toHaveAttribute('alt', 'uploads/test-image.jpg')
      })
    })
  })
})
