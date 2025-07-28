import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Send, Upload, FileText } from "lucide-react";
import { useState } from "react";

export default function RamRootsApp() {
  const [voice, setVoice] = useState("Paul Wall");

  return (
    <div className="p-4 bg-black text-white min-h-screen">
      <h1 className="text-3xl font-bold text-center mb-4 tracking-wide">RamRoots</h1>
      <p className="text-center italic text-md mb-6">
        "Other apps load and boot up… We RamRoots deep down and rise above them all."
      </p>
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gray-800 rounded mb-4">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="planner">Planner</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="blueprint">Blueprints</TabsTrigger>
        </TabsList>

        {/* Chat Tab */}
        <TabsContent value="chat">
          <Card className="bg-gray-900">
            <CardContent className="space-y-4 p-4">
              <div className="flex gap-2 items-center">
                <label className="font-bold">Voice:</label>
                <select
                  className="border p-1 rounded text-black"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                >
                  <option>Paul Wall</option>
                  <option>Trace Adkins</option>
                  <option>Old Black Lady</option>
                </select>
              </div>
              <Textarea placeholder="Talk to RamRoots..." rows={4} className="bg-white text-black" />
              <div className="flex gap-2">
                <Button className="bg-blue-700 text-white">
                  <Mic className="mr-2 h-4 w-4" /> Speak
                </Button>
                <Button className="bg-green-700 text-white">
                  <Send className="mr-2 h-4 w-4" /> Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Planner Tab */}
        <TabsContent value="planner">
          <Card className="bg-gray-900">
            <CardContent className="space-y-4 p-4">
              <h2 className="text-lg font-bold">Tasks and Encouragement</h2>
              <Input placeholder="Add task" className="bg-white text-black" />
              <Button className="w-full bg-blue-700 text-white">Add</Button>
              <div className="text-sm text-gray-400">
                Smart reminders run in the background.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Memory Tab */}
        <TabsContent value="memory">
          <Card className="bg-gray-900">
            <CardContent className="space-y-4 p-4">
              <h2 className="text-lg font-bold">Permanent Memory Storage</h2>
              <Input type="file" className="w-full bg-white text-black" />
              <Button className="w-full bg-purple-700 text-white">
                <Upload className="mr-2 h-4 w-4" /> Upload
              </Button>
              <div className="text-sm text-gray-400">
                All files, sketches, and documents are remembered forever.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Blueprint Tab */}
        <TabsContent value="blueprint">
          <Card className="bg-gray-900">
            <CardContent className="space-y-4 p-4">
              <h2 className="text-lg font-bold">Blueprint Interpreter</h2>
              <Input type="file" className="w-full bg-white text-black" />
              <Button className="w-full bg-yellow-700 text-white">
                <FileText className="mr-2 h-4 w-4" /> Generate Specs
              </Button>
              <div className="text-sm text-gray-400">
                Turn drawings into professional blueprints and spec sheets.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
