"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Play,
  Pause,
  RotateCcw,
  StepForward,
  StepBack,
  Shuffle,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  SkipForward,
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

type Position = {
  row: number
  col: number
}

type PuzzleState = {
  grid: number[][]
  blankPos: Position
  cost: number
  heuristic: number
  totalCost: number
  parent: number | null
  move: string | null
  movedTile: number | null
}

type AlgorithmStep = {
  phase: "init" | "branch" | "bound" | "prune" | "update" | "complete"
  description: string
  currentStateId: number
  bestStateId: number | null
  states: Map<number, PuzzleState>
  activeStates: number[]
  exploredStates: number[]
  prunedStates: number[]
  path: number[]
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  )
}

export default function FifteenPuzzleBranchAndBound() {
  const [initialGrid, setInitialGrid] = useState<number[][]>([
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 0],
  ])
  const [customGrid, setCustomGrid] = useState<string>("")
  const [inputError, setInputError] = useState("")

  const [steps, setSteps] = useState<AlgorithmStep[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [algorithmStarted, setAlgorithmStarted] = useState(false)
  const [solutionPath, setSolutionPath] = useState<number[]>([])
  const animationRef = useRef<NodeJS.Timeout | null>(null)

  const goalGrid = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 0],
  ]

  const directions = [
    { row: -1, col: 0, name: "up" },
    { row: 1, col: 0, name: "down" },
    { row: 0, col: -1, name: "left" },
    { row: 0, col: 1, name: "right" },
  ]

  const parseCustomGrid = (input: string): number[][] | null => {
    try {
      const values = input.replace(/\s/g, "").split(",").map(Number)

      if (values.length !== 16) {
        setInputError("Input must contain exactly 16 numbers")
        return null
      }

      const validNumbers = values.every((num) => num >= 0 && num <= 15)
      if (!validNumbers) {
        setInputError("Numbers must be between 0 and 15")
        return null
      }

      const uniqueNumbers = new Set(values).size === 16
      if (!uniqueNumbers) {
        setInputError("All numbers must be unique")
        return null
      }

      const grid: number[][] = []
      for (let i = 0; i < 4; i++) {
        grid.push(values.slice(i * 4, (i + 1) * 4))
      }

      return grid
    } catch (error) {
      setInputError("Invalid input format")
      return null
    }
  }

  const generateRandomPuzzle = () => {
    const puzzle = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 15, 0],
    ]

    let blankPos = { row: 3, col: 3 }
    const numMoves = 20 // Reduced from 100 to make puzzles more solvable

    for (let i = 0; i < numMoves; i++) {
      const validMoves = []

      for (const dir of directions) {
        const newRow = blankPos.row + dir.row
        const newCol = blankPos.col + dir.col

        if (newRow >= 0 && newRow < 4 && newCol >= 0 && newCol < 4) {
          validMoves.push({ row: newRow, col: newCol, dir })
        }
      }

      const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)]

      puzzle[blankPos.row][blankPos.col] = puzzle[randomMove.row][randomMove.col]
      puzzle[randomMove.row][randomMove.col] = 0
      blankPos = { row: randomMove.row, col: randomMove.col }
    }

    setInitialGrid(puzzle)
    setCustomGrid("")
    setInputError("")
  }

  const applyCustomGrid = () => {
    const grid = parseCustomGrid(customGrid)
    if (grid) {
      setInitialGrid(grid)
      setInputError("")
    }
  }

  const calculateManhattanDistance = (grid: number[][]): number => {
    let distance = 0

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const value = grid[row][col]

        if (value !== 0) {
          const goalRow = Math.floor((value - 1) / 4)
          const goalCol = (value - 1) % 4

          distance += Math.abs(row - goalRow) + Math.abs(col - goalCol)
        }
      }
    }

    return distance
  }

  const isPuzzleSolved = (grid: number[][]): boolean => {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (grid[row][col] !== goalGrid[row][col]) {
          return false
        }
      }
    }
    return true
  }

  const findBlankPosition = (grid: number[][]): Position => {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (grid[row][col] === 0) {
          return { row, col }
        }
      }
    }
    return { row: -1, col: -1 }
  }

  const copyGrid = (grid: number[][]): number[][] => {
    return grid.map((row) => [...row])
  }

  // Function to construct a solution path from a state to the initial state
  const constructPath = (stateId: number, states: Map<number, PuzzleState>): number[] => {
    const path: number[] = []
    let currentId = stateId

    while (currentId !== null) {
      path.unshift(currentId)
      const state = states.get(currentId)
      if (!state) break
      currentId = state.parent
    }

    return path
  }

  // Check if a puzzle is solvable
  const isPuzzleSolvable = (grid: number[][]): boolean => {
    // Convert 2D grid to 1D array, excluding the blank (0)
    const flatGrid = grid.flat().filter((num) => num !== 0)

    // Count inversions
    let inversions = 0
    for (let i = 0; i < flatGrid.length; i++) {
      for (let j = i + 1; j < flatGrid.length; j++) {
        if (flatGrid[i] > flatGrid[j]) {
          inversions++
        }
      }
    }

    // Find the row of the blank tile (0) from the bottom
    const blankPos = findBlankPosition(grid)
    const blankRowFromBottom = 4 - blankPos.row

    // For a 4x4 puzzle:
    // If the blank is on an even row from the bottom, the number of inversions must be odd for the puzzle to be solvable
    // If the blank is on an odd row from the bottom, the number of inversions must be even for the puzzle to be solvable
    return blankRowFromBottom % 2 === 0 ? inversions % 2 === 1 : inversions % 2 === 0
  }

  const startAlgorithm = () => {
    if (inputError) {
      return
    }

    // Check if the puzzle is solvable
    if (!isPuzzleSolvable(initialGrid)) {
      setInputError("This puzzle configuration is not solvable. Please try a different one.")
      return
    }

    setAlgorithmStarted(true)
    setSolutionPath([])

    const algorithmSteps: AlgorithmStep[] = []

    const blankPos = findBlankPosition(initialGrid)
    const initialHeuristic = calculateManhattanDistance(initialGrid)

    const initialState: PuzzleState = {
      grid: copyGrid(initialGrid),
      blankPos,
      cost: 0,
      heuristic: initialHeuristic,
      totalCost: initialHeuristic,
      parent: null,
      move: null,
      movedTile: null,
    }

    const states = new Map<number, PuzzleState>()
    states.set(1, initialState)

    algorithmSteps.push({
      phase: "init",
      description: `Initialize with initial state. Manhattan distance heuristic: ${initialHeuristic}`,
      currentStateId: 1,
      bestStateId: null,
      states,
      activeStates: [1],
      exploredStates: [],
      prunedStates: [],
      path: [],
    })

    const priorityQueue: number[] = [1]
    let bestStateId: number | null = null
    let stateCounter = 1

    const visited = new Set<string>()
    visited.add(JSON.stringify(initialGrid))

    while (priorityQueue.length > 0 && stateCounter < 1000) {
      priorityQueue.sort((a, b) => {
        const stateA = states.get(a)!
        const stateB = states.get(b)!
        return stateA.totalCost - stateB.totalCost
      })

      const currentStateId = priorityQueue.shift()!
      const currentState = states.get(currentStateId)!

      const exploredStates = [...algorithmSteps[algorithmSteps.length - 1].exploredStates, currentStateId]

      algorithmSteps.push({
        phase: "branch",
        description: `Select state ${currentStateId} with lowest total cost (${currentState.totalCost})`,
        currentStateId,
        bestStateId,
        states: new Map(states),
        activeStates: [...priorityQueue],
        exploredStates,
        prunedStates: [...algorithmSteps[algorithmSteps.length - 1].prunedStates],
        path: bestStateId ? constructPath(bestStateId, states) : [],
      })

      if (isPuzzleSolved(currentState.grid)) {
        bestStateId = currentStateId
        const path = constructPath(currentStateId, states)
        setSolutionPath(path)

        algorithmSteps.push({
          phase: "complete",
          description: `Solution found! Total moves: ${currentState.cost}`,
          currentStateId,
          bestStateId,
          states: new Map(states),
          activeStates: [],
          exploredStates,
          prunedStates: [...algorithmSteps[algorithmSteps.length - 1].prunedStates],
          path,
        })

        break
      }

      for (const dir of directions) {
        const newRow = currentState.blankPos.row + dir.row
        const newCol = currentState.blankPos.col + dir.col

        if (newRow >= 0 && newRow < 4 && newCol >= 0 && newCol < 4) {
          const newGrid = copyGrid(currentState.grid)
          const movedTile = newGrid[newRow][newCol]

          newGrid[currentState.blankPos.row][currentState.blankPos.col] = movedTile
          newGrid[newRow][newCol] = 0

          const stateString = JSON.stringify(newGrid)
          if (visited.has(stateString)) {
            continue
          }

          visited.add(stateString)

          stateCounter++
          const newStateId = stateCounter

          const newHeuristic = calculateManhattanDistance(newGrid)
          const newCost = currentState.cost + 1
          const newTotalCost = newCost + newHeuristic

          const newState: PuzzleState = {
            grid: newGrid,
            blankPos: { row: newRow, col: newCol },
            cost: newCost,
            heuristic: newHeuristic,
            totalCost: newTotalCost,
            parent: currentStateId,
            move: dir.name,
            movedTile,
          }

          states.set(newStateId, newState)

          algorithmSteps.push({
            phase: "branch",
            description: `Move tile ${movedTile} ${dir.name}. New state ${newStateId} with cost ${newCost} + heuristic ${newHeuristic} = ${newTotalCost}`,
            currentStateId: newStateId,
            bestStateId,
            states: new Map(states),
            activeStates: [...priorityQueue],
            exploredStates,
            prunedStates: [...algorithmSteps[algorithmSteps.length - 1].prunedStates],
            path: bestStateId ? constructPath(bestStateId, states) : [],
          })

          if (bestStateId !== null && newTotalCost >= states.get(bestStateId)!.cost) {
            algorithmSteps.push({
              phase: "prune",
              description: `Prune state ${newStateId} as its total cost (${newTotalCost}) is not better than current best (${states.get(bestStateId)!.cost})`,
              currentStateId: newStateId,
              bestStateId,
              states: new Map(states),
              activeStates: [...priorityQueue],
              exploredStates,
              prunedStates: [...algorithmSteps[algorithmSteps.length - 1].prunedStates, newStateId],
              path: bestStateId ? constructPath(bestStateId, states) : [],
            })

            continue
          }

          priorityQueue.push(newStateId)

          algorithmSteps.push({
            phase: "bound",
            description: `Add state ${newStateId} to queue with total cost ${newTotalCost}`,
            currentStateId: newStateId,
            bestStateId,
            states: new Map(states),
            activeStates: [...priorityQueue],
            exploredStates,
            prunedStates: [...algorithmSteps[algorithmSteps.length - 1].prunedStates],
            path: bestStateId ? constructPath(bestStateId, states) : [],
          })
        }
      }
    }

    if (bestStateId === null) {
      algorithmSteps.push({
        phase: "complete",
        description: "No solution found within the search limit.",
        currentStateId: algorithmSteps[algorithmSteps.length - 1].currentStateId,
        bestStateId: null,
        states: new Map(states),
        activeStates: [],
        exploredStates: algorithmSteps[algorithmSteps.length - 1].exploredStates,
        prunedStates: algorithmSteps[algorithmSteps.length - 1].prunedStates,
        path: [],
      })
    } else {
      // Make sure the final step has the solution path
      const finalStep = algorithmSteps[algorithmSteps.length - 1]
      if (finalStep.path.length === 0 && finalStep.bestStateId !== null) {
        finalStep.path = constructPath(finalStep.bestStateId, states)
      }
    }

    setSteps(algorithmSteps)
    setCurrentStep(0)
  }

  const resetAlgorithm = () => {
    setAlgorithmStarted(false)
    setSteps([])
    setCurrentStep(0)
    setIsPlaying(false)
    setSolutionPath([])
    if (animationRef.current) {
      clearTimeout(animationRef.current)
    }
  }

  const togglePlay = () => {
    setIsPlaying(!isPlaying)
  }

  const stepForward = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      setIsPlaying(false)
    }
  }

  const stepBackward = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  function skipToEnd() {
    if (steps.length > 0) {
      // Find the step with a complete phase
      let completeStepIndex = -1
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].phase === "complete") {
          completeStepIndex = i
          break
        }
      }

      // If found, go to that step, otherwise go to the last step
      const targetStep = completeStepIndex !== -1 ? completeStepIndex : steps.length - 1
      setCurrentStep(targetStep)
      setIsPlaying(false)
    }
  }

  useEffect(() => {
    if (isPlaying && currentStep < steps.length - 1) {
      animationRef.current = setTimeout(() => {
        setCurrentStep(currentStep + 1)
      }, 2000 / speed)
    } else if (currentStep >= steps.length - 1) {
      setIsPlaying(false)
    }

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current)
      }
    }
  }, [isPlaying, currentStep, steps, speed])

  const getTileColor = (value: number, isHighlighted: boolean, isInPath: boolean) => {
    if (value === 0) return "bg-muted border-border dark:bg-muted/50"
    if (isHighlighted) return "bg-yellow-100 dark:bg-yellow-950/50 border-yellow-500"
    if (isInPath) return "bg-green-100 dark:bg-green-950/50 border-green-500"
    return "bg-background border-border dark:bg-muted/30"
  }

  const getMoveIcon = (move: string | null) => {
    switch (move) {
      case "up":
        return <ArrowUp className="w-4 h-4" />
      case "down":
        return <ArrowDown className="w-4 h-4" />
      case "left":
        return <ArrowLeft className="w-4 h-4" />
      case "right":
        return <ArrowRight className="w-4 h-4" />
      default:
        return null
    }
  }

  const renderPuzzleGrid = (
    grid: number[][],
    highlightedTile: number | null = null,
    pathTiles: Set<number> = new Set(),
  ) => {
    return (
      <div className="grid grid-cols-4 gap-2 w-full max-w-md mx-auto">
        {grid.flat().map((value, index) => {
          const row = Math.floor(index / 4)
          const col = index % 4
          const isHighlighted = value === highlightedTile
          const isInPath = pathTiles.has(value)

          return (
            <motion.div
              key={index}
              className={`aspect-square flex items-center justify-center text-2xl font-bold rounded-md border-2 ${getTileColor(
                value,
                isHighlighted,
                isInPath,
              )}`}
              initial={{ scale: 0.9 }}
              animate={{
                scale: isHighlighted ? 1.05 : 1,
                opacity: value === 0 ? 0.2 : 1,
              }}
              transition={{ duration: 0.3 }}
            >
              {value !== 0 && value}
            </motion.div>
          )
        })}
      </div>
    )
  }

  const renderStateDetails = () => {
    if (!steps[currentStep]) return null

    const { currentStateId, bestStateId, states } = steps[currentStep]
    const currentState = states.get(currentStateId)!

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Current State</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium mb-2">State Details</h4>
            <div className="border rounded-md p-3 bg-yellow-50 dark:bg-yellow-950/20 border-border">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>State ID:</div>
                <div className="font-medium">{currentStateId}</div>
                <div>Moves so far:</div>
                <div className="font-medium">{currentState.cost}</div>
                <div>Heuristic:</div>
                <div className="font-medium">{currentState.heuristic}</div>
                <div>Total cost:</div>
                <div className="font-medium">{currentState.totalCost}</div>
                {currentState.move && (
                  <>
                    <div>Last move:</div>
                    <div className="font-medium flex items-center gap-1">
                      {getMoveIcon(currentState.move)} Tile {currentState.movedTile} {currentState.move}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Best Solution</h4>
            <div className="border rounded-md p-3 bg-green-50 dark:bg-green-950/20 border-border">
              {bestStateId !== null ? (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>State ID:</div>
                  <div className="font-medium">{bestStateId}</div>
                  <div>Total moves:</div>
                  <div className="font-medium">{states.get(bestStateId)!.cost}</div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No solution found yet</div>
              )}
            </div>
          </div>
        </div>

        <h4 className="text-sm font-medium mb-2">Priority Queue</h4>
        <div className="border rounded-md p-3">
          {steps[currentStep].activeStates.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {steps[currentStep].activeStates.map((stateId) => {
                const state = states.get(stateId)!
                return (
                  <Badge key={stateId} variant="outline" className="px-2 py-1">
                    State {stateId} (f: {state.totalCost})
                  </Badge>
                )
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Queue is empty</div>
          )}
        </div>
      </div>
    )
  }

  const renderSolutionPath = () => {
    if (!steps[currentStep]) return null

    // Get the path from the current step or use the global solution path
    const path =
      steps[currentStep].path.length > 0
        ? steps[currentStep].path
        : steps[currentStep].bestStateId
          ? constructPath(steps[currentStep].bestStateId, steps[currentStep].states)
          : solutionPath

    if (!path.length) {
      // If we're at the last step and there's a best state but no path
      if (currentStep === steps.length - 1 && steps[currentStep].bestStateId) {
        const constructedPath = constructPath(steps[currentStep].bestStateId, steps[currentStep].states)
        if (constructedPath.length > 0) {
          return renderSolutionPathContent(constructedPath, steps[currentStep].states)
        }
      }
      return null
    }

    return renderSolutionPathContent(path, steps[currentStep].states)
  }

  const renderSolutionPathContent = (path: number[], states: Map<number, PuzzleState>) => {
    return (
      <div className="mt-6 space-y-4">
        <h3 className="text-lg font-semibold">Solution Path</h3>
        <div className="border rounded-md p-4">
          <div className="flex flex-wrap gap-4 justify-center">
            {path.map((stateId, index) => {
              const state = states.get(stateId)
              if (!state) return null

              return (
                <div key={stateId} className="text-center">
                  <div className="text-sm font-medium mb-2">
                    {index === 0
                      ? "Initial State"
                      : state.movedTile && state.move
                        ? `Move ${index}: Tile ${state.movedTile} ${state.move}`
                        : `Move ${index}`}
                  </div>
                  <div className="grid grid-cols-4 gap-1 w-24 h-24">
                    {state.grid.flat().map((value, cellIndex) => (
                      <div
                        key={cellIndex}
                        className={`flex items-center justify-center text-xs font-bold rounded-sm border ${
                          value === 0
                            ? "bg-gray-100 dark:bg-gray-800 border-gray-300"
                            : "bg-white dark:bg-gray-700 border-gray-300"
                        }`}
                      >
                        {value !== 0 && value}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Calculate progress percentage safely
  const calculateProgressPercentage = () => {
    if (!steps.length || steps.length <= 1) {
      return 0
    }
    return Math.round((currentStep / (steps.length - 1)) * 100)
  }

  // Calculate progress bar width safely
  const calculateProgressWidth = () => {
    if (!steps.length || steps.length <= 1) {
      return "0%"
    }
    return `${(currentStep / (steps.length - 1)) * 100}%`
  }

  return (
    <div className="flex flex-col items-center w-full max-w-6xl mx-auto p-4 space-y-6 bg-background text-foreground">
      <div className="w-full flex justify-between items-center">
        <h1 className="text-2xl font-bold">15 Puzzle Problem - Branch and Bound</h1>
        <ThemeToggle />
      </div>

      <Tabs defaultValue="input" className="w-full">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="visualization" disabled={!algorithmStarted}>
            Visualization
          </TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="space-y-4">
          <Card className="p-4 space-y-4 border border-border bg-card text-card-foreground">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Puzzle Configuration</h2>

              <div className="space-y-2">
                <Label htmlFor="custom-grid">Custom Grid (comma-separated, 0 represents the blank space)</Label>
                <div className="flex gap-2">
                  <Input
                    id="custom-grid"
                    placeholder="e.g., 1,2,3,4,5,6,7,8,9,10,11,12,13,14,0,15"
                    value={customGrid}
                    onChange={(e) => setCustomGrid(e.target.value)}
                  />
                  <Button onClick={applyCustomGrid}>Apply</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter 16 numbers (0-15) separated by commas. The numbers should be in row-major order.
                </p>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={generateRandomPuzzle}>
                  <Shuffle className="w-4 h-4 mr-2" />
                  Generate Random Puzzle
                </Button>
              </div>

              {inputError && (
                <Alert variant="destructive" className="dark:bg-red-950 dark:text-red-200">
                  <AlertDescription>{inputError}</AlertDescription>
                </Alert>
              )}

              <div className="pt-4">
                <h3 className="text-md font-medium mb-4">Current Puzzle</h3>
                {renderPuzzleGrid(initialGrid)}
              </div>

              <div className="flex justify-between pt-4">
                <Button onClick={startAlgorithm}>Start Algorithm</Button>
                {algorithmStarted && (
                  <Button variant="outline" onClick={resetAlgorithm}>
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="visualization" className="space-y-4">
          {algorithmStarted && (
            <Card className="p-4 space-y-4 border border-border bg-card text-card-foreground">
              <div className="flex flex-wrap justify-center gap-4 w-full mb-4">
                <Button onClick={resetAlgorithm} variant="outline">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
                <Button onClick={togglePlay} variant="outline">
                  {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  {isPlaying ? "Pause" : "Play"}
                </Button>
                <Button onClick={stepBackward} variant="outline" disabled={currentStep <= 0}>
                  <StepBack className="w-4 h-4 mr-2" />
                  Previous
                </Button>
                <Button onClick={stepForward} variant="outline" disabled={currentStep >= steps.length - 1}>
                  <StepForward className="w-4 h-4 mr-2" />
                  Next
                </Button>
                <Button
                  onClick={skipToEnd}
                  variant="outline"
                  disabled={currentStep >= steps.length - 1 || steps.length === 0}
                >
                  <SkipForward className="w-4 h-4 mr-2" />
                  Skip to End
                </Button>

                <div className="flex items-center gap-2 min-w-[200px]">
                  <span className="text-sm">Speed:</span>
                  <Slider
                    value={[speed]}
                    min={0.5}
                    max={3}
                    step={0.5}
                    onValueChange={(value) => setSpeed(value[0])}
                    className="w-24"
                  />
                  <span className="text-sm">{speed}x</span>
                </div>
              </div>

              <div className="bg-primary/10 rounded-md p-2 text-center text-sm font-medium mb-4">
                {steps[currentStep]?.description || "Preparing algorithm..."}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Puzzle State</h3>
                  <div className="flex justify-center">
                    {steps[currentStep] &&
                      renderPuzzleGrid(
                        steps[currentStep].states.get(steps[currentStep].currentStateId)!.grid,
                        steps[currentStep].states.get(steps[currentStep].currentStateId)!.movedTile,
                        new Set(
                          steps[currentStep].path.length
                            ? steps[currentStep].states
                                .get(steps[currentStep].path[steps[currentStep].path.length - 1])!
                                .grid.flat()
                                .filter((v) => v !== 0)
                            : [],
                        ),
                      )}
                  </div>
                </div>

                <div className="space-y-4">
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-4">
                      {renderStateDetails()}
                      {renderSolutionPath()}
                    </div>
                  </ScrollArea>
                </div>
              </div>

              {/* Search tree visualization */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">Search Tree</h3>
                <div className="border rounded-md p-4 overflow-x-auto">
                  <div className="min-w-[800px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>State ID</TableHead>
                          <TableHead>Parent</TableHead>
                          <TableHead>Move</TableHead>
                          <TableHead>Cost (g)</TableHead>
                          <TableHead>Heuristic (h)</TableHead>
                          <TableHead>Total (f)</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {steps[currentStep] &&
                          Array.from(steps[currentStep].states.entries())
                            .filter(
                              ([id]) =>
                                id <= steps[currentStep].currentStateId || steps[currentStep].activeStates.includes(id),
                            )
                            .sort((a, b) => a[0] - b[0])
                            .map(([id, state]) => {
                              let status = "Explored"
                              if (steps[currentStep].activeStates.includes(id)) status = "In Queue"
                              if (steps[currentStep].prunedStates.includes(id)) status = "Pruned"
                              if (id === steps[currentStep].currentStateId) status = "Current"
                              if (steps[currentStep].bestStateId === id) status = "Best Solution"

                              return (
                                <TableRow
                                  key={id}
                                  className={
                                    id === steps[currentStep].currentStateId
                                      ? "bg-yellow-50 dark:bg-yellow-900/10"
                                      : steps[currentStep].prunedStates.includes(id)
                                        ? "bg-red-50 dark:bg-red-900/10"
                                        : steps[currentStep].bestStateId === id
                                          ? "bg-green-50 dark:bg-green-900/10"
                                          : ""
                                  }
                                >
                                  <TableCell>{id}</TableCell>
                                  <TableCell>{state.parent || "-"}</TableCell>
                                  <TableCell>
                                    {state.move ? (
                                      <div className="flex items-center gap-1">
                                        {getMoveIcon(state.move)} Tile {state.movedTile} {state.move}
                                      </div>
                                    ) : (
                                      "-"
                                    )}
                                  </TableCell>
                                  <TableCell>{state.cost}</TableCell>
                                  <TableCell>{state.heuristic}</TableCell>
                                  <TableCell>{state.totalCost}</TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        status === "Current"
                                          ? "default"
                                          : status === "Best Solution"
                                            ? "default"
                                            : status === "Pruned"
                                              ? "destructive"
                                              : status === "In Queue"
                                                ? "outline"
                                                : "secondary"
                                      }
                                    >
                                      {status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full mt-4">
                <div className="w-full bg-muted dark:bg-muted/50 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{
                      width: calculateProgressWidth(),
                    }}
                  ></div>
                </div>
                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                  <span>
                    Step {currentStep + 1} of {steps.length}
                  </span>
                  <span>{calculateProgressPercentage()}% Complete</span>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Explanation */}
      <div className="text-sm text-muted-foreground max-w-2xl text-center">
        <p>
          The 15 Puzzle is a classic sliding puzzle that consists of a 4×4 grid with 15 numbered tiles and one empty
          space. The goal is to rearrange the tiles from a given initial configuration to the goal configuration by
          sliding tiles into the empty space.
        </p>
        <p className="mt-2">
          Branch and Bound is an algorithm design paradigm for solving optimization problems. It systematically
          enumerates candidate solutions by means of state space search: the set of candidate solutions is thought of as
          forming a rooted tree with the full set at the root.
        </p>
        <p className="mt-2">
          For the 15 Puzzle, we use the Manhattan distance heuristic, which calculates the sum of the horizontal and
          vertical distances of each tile from its goal position. This provides a lower bound on the number of moves
          required to solve the puzzle.
        </p>
      </div>
    </div>
  )
}
