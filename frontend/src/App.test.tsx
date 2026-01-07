import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import App from './App'

describe('App Component', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
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

  describe('Upload State Transitions', () => {
    it('button is enabled by default', () => {
      render(<App />)
      const button = screen.getByRole('button', { name: /Upload Image/i })
      expect(button).not.toBeDisabled()
    })

    it('button becomes disabled when clicking upload', () => {
      render(<App />)
      
      const button = screen.getByRole('button', { name: /Upload Image/i })
      fireEvent.click(button)
      
      expect(button).toBeDisabled()
    })

    it('button text changes to "Uploading..." when upload starts', () => {
      render(<App />)
      
      const button = screen.getByRole('button', { name: /Upload Image/i })
      fireEvent.click(button)
      
      expect(screen.getByRole('button', { name: /Uploading.../i })).toBeInTheDocument()
    })

    it('button returns to enabled state after upload completes', async () => {
      render(<App />)
      
      const button = screen.getByRole('button', { name: /Upload Image/i })
      fireEvent.click(button)
      
      // Run all pending timers
      await act(async () => {
        vi.runAllTimers()
      })
      
      expect(screen.getByRole('button', { name: /Upload Image/i })).not.toBeDisabled()
    })

    it('button text returns to "Upload Image" after upload completes', async () => {
      render(<App />)
      
      const button = screen.getByRole('button', { name: /Upload Image/i })
      fireEvent.click(button)
      
      // Run all pending timers
      await act(async () => {
        vi.runAllTimers()
      })
      
      expect(screen.getByRole('button', { name: /Upload Image/i })).toBeInTheDocument()
    })

    it('handles multiple upload clicks correctly', async () => {
      render(<App />)
      
      let button = screen.getByRole('button', { name: /Upload Image/i })
      
      // First upload
      fireEvent.click(button)
      expect(screen.getByRole('button', { name: /Uploading.../i })).toBeDisabled()
      
      await act(async () => {
        vi.runAllTimers()
      })
      
      button = screen.getByRole('button', { name: /Upload Image/i })
      expect(button).not.toBeDisabled()
      
      // Second upload
      fireEvent.click(button)
      expect(screen.getByRole('button', { name: /Uploading.../i })).toBeDisabled()
      
      await act(async () => {
        vi.runAllTimers()
      })
      
      expect(screen.getByRole('button', { name: /Upload Image/i })).not.toBeDisabled()
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
