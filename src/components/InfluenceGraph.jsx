import React, { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCollide, forceLink, forceManyBody } from 'd3-force'

function createHubAndSpokeData(network) {
  if (!network?.nodes?.length) return { nodes: [], links: [] }

  const sourceNodes = network.nodes.filter(node => node.id !== 'topic_center')
  const nodes = [
    {
      id: 'root',
      name: 'Audience Topic',
      val: 25,
      color: '#FFBE0B',
    },
    ...sourceNodes.map((node, index) => ({
      id: String(node.id || `mention_${index}`),
      name: node.author
        || node.text
        || node.label
        || `Mention ${index + 1}`,
      val: 5,
      color: '#0bdbb4',
    })),
  ]

  return {
    nodes,
    links: nodes
      .slice(1)
      .map(node => ({ source: 'root', target: node.id })),
  }
}

function drawNode(node, ctx, globalScale) {
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

  const radius = node.val === 25 ? 15 : 5
  ctx.save()
  ctx.translate(node.x, node.y)

  if (node.val === 25) {
    ctx.beginPath()
    ctx.arc(0, 0, radius + 10, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 190, 11, 0.2)'
    ctx.lineWidth = 3
    ctx.shadowBlur = 28
    ctx.shadowColor = '#FFBE0B'
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.arc(0, 0, radius + (node.val === 25 ? 7 : 3), 0, Math.PI * 2)
  ctx.strokeStyle = node.val === 25 ? 'rgba(255, 215, 0, 0.7)' : `${node.color}66`
  ctx.lineWidth = node.val === 25 ? 2 : 1
  ctx.shadowBlur = node.val === 25 ? 22 : 12
  ctx.shadowColor = node.color
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = node.color
  ctx.shadowBlur = node.val === 25 ? 18 : 10
  ctx.fill()

  if (globalScale > 0.55) {
    const label = String(node.name).replace(/\s+/g, ' ').slice(0, 48)
    ctx.font = `${node.val === 25 ? 600 : 500} ${Math.max((node.val === 25 ? 10 : 8) / globalScale, 3)}px DM Sans, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#e9f4f1'
    ctx.shadowBlur = 0
    ctx.fillText(label, 0, radius + 8 / globalScale)
  }

  ctx.restore()
}

export default function InfluenceGraph({ network }) {
  const fgRef = useRef(null)
  const containerRef = useRef(null)
  const [size, setSize] = useState({ width: 760, height: 430 })
  const graphData = useMemo(() => createHubAndSpokeData(network), [network])

  useEffect(() => {
    if (!containerRef.current) return undefined

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(280, Math.floor(entry.contentRect.width))
      setSize({
        width,
        height: Math.max(360, Math.min(560, Math.floor(width * 0.56))),
      })
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const graph = fgRef.current
    if (!graph || !graphData.nodes.length) return

    graph.d3Force('charge', forceManyBody().strength(-200))
    graph.d3Force(
      'collide',
      forceCollide().radius(node => Math.sqrt(node.val) * 8 + 5)
    )
    graph.d3Force(
      'link',
      forceLink().id(node => node.id).distance(80)
    )
    graph.d3ReheatSimulation()
  }, [graphData])

  return (
    <div
      className="influence-graph"
      ref={containerRef}
      style={{
        position: 'relative',
        zIndex: 50,
        width: '100%',
        pointerEvents: 'auto',
      }}
    >
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0, 0, 0, 0)"
        nodeCanvasObject={drawNode}
        nodeVal="val"
        nodeColor="color"
        nodePointerAreaPaint={(node, color, ctx) => {
          const radius = node.val === 25 ? 24 : 12
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
          ctx.fill()
        }}
        enableNodeDrag={true}
        onNodeDragEnd={node => {
          node.fx = null
          node.fy = null
        }}
        nodeLabel={node => node.name}
        linkColor={() => 'rgba(255, 255, 255, 0.2)'}
        linkWidth={0.8}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={1.2}
        linkDirectionalParticleColor={() => 'rgba(11, 219, 180, 0.65)'}
        linkDirectionalParticleSpeed={0.002}
        d3AlphaDecay={0.018}
        d3VelocityDecay={0.28}
        cooldownTicks={Infinity}
        enableZoomInteraction
        enablePanInteraction
      />
    </div>
  )
}
