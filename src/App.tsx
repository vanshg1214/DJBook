import FlipbookViewer from './components/FlipbookViewer';
import './App.css';

function App() {
  return (
    <div className="app-wrapper">
      <FlipbookViewer pdfFile="/GreatGalleries_v53.pdf" />
    </div>
  );
}

export default App;
