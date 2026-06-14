#include "SearchEngine.h"
#include <iostream>
#include <iomanip>
#include <string>
#include <vector>
#include <sstream>
#include <algorithm>
#include <cstdlib>

using namespace std;

namespace {

class NullBuffer : public streambuf {
public:
    int overflow(int c) override {
        return c;
    }
};

string trimLeadingSpace(string value) {
    if (!value.empty() && value[0] == ' ') {
        value.erase(0, 1);
    }
    return value;
}

string jsonEscape(const string& input) {
    string output;
    output.reserve(input.size());

    for (char ch : input) {
        switch (ch) {
            case '"': output += "\\\""; break;
            case '\\': output += "\\\\"; break;
            case '\b': output += "\\b"; break;
            case '\f': output += "\\f"; break;
            case '\n': output += "\\n"; break;
            case '\r': output += "\\r"; break;
            case '\t': output += "\\t"; break;
            default:
                if (static_cast<unsigned char>(ch) < 0x20) {
                    const char* hex = "0123456789abcdef";
                    output += "\\u00";
                    output += hex[(ch >> 4) & 0x0F];
                    output += hex[ch & 0x0F];
                } else {
                    output += ch;
                }
                break;
        }
    }

    return output;
}

string makeJsonString(const string& value) {
    return "\"" + jsonEscape(value) + "\"";
}

string buildSearchResultsJson(const vector<SearchResult>& results, SearchEngine& engine, int maxPreview = 200) {
    ostringstream json;
    json << "{\"results\":[";

    for (size_t i = 0; i < results.size(); ++i) {
        if (i > 0) {
            json << ",";
        }

        const auto& result = results[i];
        string docContent = engine.getDocument(result.docId);
        size_t previewLen = static_cast<size_t>(maxPreview);
        string preview = docContent.substr(0, previewLen);
        if (docContent.size() > previewLen) {
            preview += "...";
        }

        replace(preview.begin(), preview.end(), '\n', ' ');
        replace(preview.begin(), preview.end(), '\r', ' ');

        json << "{\"docId\":" << result.docId
             << ",\"score\":" << fixed << setprecision(4) << result.score
             << ",\"preview\":" << makeJsonString(preview) << "}";
    }

    json << "]}";
    return json.str();
}

string buildAutocompleteJson(const vector<string>& suggestions) {
    ostringstream json;
    json << "{\"suggestions\":[";

    for (size_t i = 0; i < suggestions.size(); ++i) {
        if (i > 0) {
            json << ",";
        }
        json << makeJsonString(suggestions[i]);
    }

    json << "]}";
    return json.str();
}

string buildJsonStringArray(const vector<string>& values) {
    ostringstream json;
    json << "[";

    for (size_t i = 0; i < values.size(); ++i) {
        if (i > 0) {
            json << ",";
        }
        json << makeJsonString(values[i]);
    }

    json << "]";
    return json.str();
}

string buildStatsJson(SearchEngine& engine) {
    ostringstream json;
    json << "{\"totalDocuments\":" << engine.getTotalDocuments()
         << ",\"totalTerms\":" << engine.getTotalTerms()
         << ",\"totalPostings\":" << engine.getTotalPostings()
         << "}";
    return json.str();
}

string buildErrorJson(const string& message) {
    return "{\"error\":" + makeJsonString(message) + "}";
}

bool initializeEngine(SearchEngine& engine, const string& datasetPath, bool apiMode) {
    NullBuffer nullBuffer;
    streambuf* originalCout = cout.rdbuf();
    streambuf* originalCerr = cerr.rdbuf();

    if (apiMode) {
        cout.rdbuf(&nullBuffer);
        cerr.rdbuf(&nullBuffer);
    }

    bool loaded = engine.loadDocuments(datasetPath);
    bool built = false;
    if (loaded) {
        engine.buildIndex();
        built = true;
    }

    if (apiMode) {
        cout.rdbuf(originalCout);
        cerr.rdbuf(originalCerr);
    }

    return loaded && built;
}

int runApiMode(SearchEngine& engine) {
    vector<string> searchHistory;
    string command;

    while (getline(cin, command)) {
        if (command.empty()) {
            continue;
        }

        istringstream iss(command);
        string cmd;
        iss >> cmd;

        if (cmd == "quit" || cmd == "exit") {
            break;
        } else if (cmd == "search") {
            string query;
            getline(iss, query);
            query = trimLeadingSpace(query);

            if (query.empty()) {
                cout << buildErrorJson("Please provide a search query.") << '\n';
                continue;
            }

            searchHistory.push_back(query);
            vector<SearchResult> results = engine.search(query, 10);
            cout << buildSearchResultsJson(results, engine) << '\n';
        } else if (cmd == "autocomplete") {
            string prefix;
            iss >> prefix;

            if (prefix.empty()) {
                cout << buildErrorJson("Please provide a prefix.") << '\n';
                continue;
            }

            vector<string> suggestions = engine.autocomplete(prefix, 10);
            cout << buildAutocompleteJson(suggestions) << '\n';
        } else if (cmd == "document") {
            int docId;
            if (iss >> docId) {
                if (docId >= 0 && docId < static_cast<int>(engine.getTotalDocuments())) {
                    string content = engine.getDocument(docId);
                    cout << "{\"docId\":" << docId << ",\"content\":" << makeJsonString(content) << "}\n";
                } else {
                    cout << buildErrorJson("Document ID out of range.") << '\n';
                }
            } else {
                cout << buildErrorJson("Invalid document ID.") << '\n';
            }
        } else if (cmd == "dictionary") {
            cout << buildJsonStringArray(engine.getDictionaryTerms()) << '\n';
        } else if (cmd == "stats") {
            cout << buildStatsJson(engine) << '\n';
        } else {
            cout << buildErrorJson("Unknown command: " + cmd) << '\n';
        }
    }

    return 0;
}

} // namespace

void printHelp() {
    cout << "\n========== Mini Search Engine Commands ==========\n";
    cout << "Commands:\n";
    cout << "  search <query>          - Search for documents\n";
    cout << "  autocomplete <prefix>   - Get autocomplete suggestions\n";
    cout << "  dictionary              - Print all indexed terms as JSON\n";
    cout << "  suggest <query>         - Get query suggestions\n";
    cout << "  stats                   - Show index statistics\n";
    cout << "  performance             - Show performance report\n";
    cout << "  help                    - Show this help message\n";
    cout << "  quit / exit             - Exit the program\n";
    cout << "================================================\n\n";
}

void printSearchResults(const vector<SearchResult>& results, 
                       SearchEngine& engine, int maxPreview = 200) {
    if (results.empty()) {
        cout << "No results found.\n" << endl;
        return;
    }
    
    cout << "\nFound " << results.size() << " result(s):\n";
    cout << fixed << setprecision(4);
    
    for (size_t i = 0; i < results.size(); ++i) {
        const auto& result = results[i];
        string docContent = engine.getDocument(result.docId);
        
        cout << "\n[" << (i + 1) << "] Document ID: " << result.docId 
             << " | Score: " << result.score << "\n";
        
        // Preview document content
        size_t previewLen = static_cast<size_t>(maxPreview);
        string preview = docContent.substr(0, previewLen);
        if (docContent.size() > previewLen) {
            preview += "...";
        }
        
        // Replace newlines with spaces for cleaner output
        replace(preview.begin(), preview.end(), '\n', ' ');
        replace(preview.begin(), preview.end(), '\r', ' ');
        
        cout << "Preview: " << preview << "\n";
    }
    cout << "\n";
}

int main(int argc, char* argv[]) {
    bool apiMode = false;
    string datasetPath;

    for (int i = 1; i < argc; ++i) {
        string arg = argv[i];
        if (arg == "--api") {
            apiMode = true;
        } else if (datasetPath.empty()) {
            datasetPath = arg;
        }
    }

    if (!apiMode) {
        cout << "========================================\n";
        cout << "   Mini Search Engine - DSA Project\n";
        cout << "========================================\n\n";
    }

    if (datasetPath.empty()) {
        // Default to 20news-18828 if it exists
        if (system("test -d 20news-18828") == 0) {
            datasetPath = "20news-18828";
            if (!apiMode) {
                cout << "No directory specified. Using default: " << datasetPath << endl;
            }
        } else {
            if (apiMode) {
                cout << buildErrorJson("Usage: <program> [dataset_directory] [--api]") << '\n';
            } else {
                cerr << "Usage: " << argv[0] << " <dataset_directory>" << endl;
                cerr << "Example: " << argv[0] << " ./20news-18828" << endl;
                cerr << "\nTo download the 20 Newsgroups dataset, run:" << endl;
                cerr << "  ./download_dataset.sh" << endl;
            }
            return 1;
        }
    }

    SearchEngine engine;

    if (!apiMode) {
        cout << "Loading documents from: " << datasetPath << endl;
        cout << "Reading files recursively from all subdirectories..." << endl;
    }

    if (!initializeEngine(engine, datasetPath, apiMode)) {
        if (apiMode) {
            cout << buildErrorJson("Failed to load documents and build index.") << '\n';
        } else {
            cerr << "Failed to load documents. Exiting." << endl;
            cerr << "\nMake sure the dataset directory exists and contains text files." << endl;
            cerr << "To download the 20 Newsgroups dataset, run:" << endl;
            cerr << "  ./download_dataset.sh" << endl;
        }
        return 1;
    }

    if (apiMode) {
        return runApiMode(engine);
    }

    cout << "\nIndex built successfully! Ready to search.\n" << endl;
    
    // Store search history for suggestions
    vector<string> searchHistory;
    
    printHelp();
    
    string command;
    while (true) {
        cout << "> ";
        getline(cin, command);
        
        if (command.empty()) {
            continue;
        }
        
        istringstream iss(command);
        string cmd;
        iss >> cmd;
        
        if (cmd == "quit" || cmd == "exit") {
            cout << "Goodbye!" << endl;
            break;
        }
        else if (cmd == "help") {
            printHelp();
        }
        else if (cmd == "search") {
            string query;
            getline(iss, query);
            
            // Remove leading space if any
            if (!query.empty() && query[0] == ' ') {
                query = query.substr(1);
            }
            
            if (query.empty()) {
                cout << "Error: Please provide a search query." << endl;
                continue;
            }
            
            // Add to search history
            searchHistory.push_back(query);
            
            vector<SearchResult> results = engine.search(query, 10);
            printSearchResults(results, engine);
        }
        else if (cmd == "autocomplete") {
            string prefix;
            iss >> prefix;
            
            if (prefix.empty()) {
                cout << "Error: Please provide a prefix." << endl;
                continue;
            }
            
            vector<string> suggestions = engine.autocomplete(prefix, 10);
            
            if (suggestions.empty()) {
                cout << "No suggestions found for: " << prefix << endl;
            } else {
                cout << "\nAutocomplete suggestions for '" << prefix << "':\n";
                for (size_t i = 0; i < suggestions.size(); ++i) {
                    cout << "  " << (i + 1) << ". " << suggestions[i] << endl;
                }
                cout << endl;
            }
        }
        else if (cmd == "dictionary") {
            cout << buildJsonStringArray(engine.getDictionaryTerms()) << endl;
        }
        else if (cmd == "suggest") {
            string query;
            getline(iss, query);
            
            if (!query.empty() && query[0] == ' ') {
                query = query.substr(1);
            }
            
            if (query.empty() || searchHistory.empty()) {
                cout << "No suggestions available (need search history)." << endl;
                continue;
            }
            
            vector<string> suggestions = engine.getQuerySuggestions(query, searchHistory, 5);
            
            if (suggestions.empty()) {
                cout << "No similar queries found." << endl;
            } else {
                cout << "\nQuery suggestions for '" << query << "':\n";
                for (size_t i = 0; i < suggestions.size(); ++i) {
                    cout << "  " << (i + 1) << ". " << suggestions[i] << endl;
                }
                cout << endl;
            }
        }
        else if (cmd == "stats") {
            cout << "\n========== Index Statistics ==========\n";
            cout << "Total Documents: " << engine.getTotalDocuments() << endl;
            cout << "Total Terms: " << engine.getTotalTerms() << endl;
            cout << "Total Postings: " << engine.getTotalPostings() << endl;
            cout << "======================================\n\n";
        }
        else if (cmd == "performance") {
            engine.getPerformanceTracker().printReport();
        }
        else {
            cout << "Unknown command: " << cmd << endl;
            cout << "Type 'help' for available commands." << endl;
        }
    }
    
    // Print final performance report
    cout << "\n";
    engine.getPerformanceTracker().printReport();
    
    return 0;
}
