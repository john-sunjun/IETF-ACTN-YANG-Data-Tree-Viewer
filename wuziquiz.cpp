#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/highgui.hpp>
#include <iostream>

using namespace cv;
using namespace std;

// string PAWN[] = {"⊹ ", "⭘ ", "⬤ "};
string PAWN[] = {"+ ", "O ", "X "};
// string PAWN[] = {"+ ", "@ ", "O "};
int getBoardLayout(Mat board, int result[15][15])
{
    int cellHalfWidth = board.cols / 28;
    int cellHalfHeight = board.rows / 28;
    int checkSize = cellHalfWidth * cellHalfHeight;
    for (int i = 1; i < 14; i++)
    {
        int y = board.rows * i / 14 - cellHalfHeight / 2;
        for (int j = 1; j < 14; j++)
        {
            int x = board.cols * j / 14 - cellHalfWidth / 2;
            Mat cell = board(Rect(x, y, cellHalfWidth, cellHalfHeight));
            int whitePixels = countNonZero(cell);
            result[i][j] = 0;
            if (whitePixels > checkSize / 2)
            {
                result[i][j] = 1;
            }
            else if (whitePixels < 3)
            {
                result[i][j] = 2;
            }
        }
    }
    return 0;
}

void showResult(int result[15][15])
{
    for (int i = 0; i < 15; i++)
    {
        for (int j = 0; j < 15; j++)
        {
            cout << PAWN[result[i][j]];
        }
        cout << endl;
    }
}

int scanOneImage(Mat binary, int number)
{
    vector<vector<Point>> contours;
    findContours(binary, contours, RETR_EXTERNAL, CHAIN_APPROX_NONE);
    int result[15][15] = {0};
    for (int i = contours.size() - 1; i >= 0; i--)
    {
        Rect bRect = boundingRect(contours[i]);
        if (bRect.width > 100 && getBoardLayout(binary(bRect), result) == 0)
        {
            number++;
            cout << "Quiz #" << number << endl;
            showResult(result);
        }
    }
    return number;
}
bool isNumber(String s)
{
    for (int i = 0; i < s.length(); i++)
    {
        if (s[i] > '9' || s[i] < '0')
            return false;
    }
    return true;
}

bool cmp(String a, String b)
{
    String names[] = {String(a).erase(a.rfind('.')).erase(0, a.rfind('\\') + 1),
                      String(b).erase(b.rfind('.')).erase(0, b.rfind('\\') + 1)};
    int diff = names[0].length() - names[1].length();
    if (diff != 0 && isNumber(names[0]) && isNumber(names[1]))
    {
        names[diff > 0 ? 1 : 0].insert(0, abs(diff), ' ');
    }
    return names[0] < names[1];
}

int main(int argc, char **argv)
{
    vector<String> imgFiles;
    Mat src, binary;
    int number = 0;

    glob("*.??g", imgFiles);
    sort(imgFiles.begin(), imgFiles.end(), cmp);
    for (int i = 0; i < imgFiles.size(); ++i)
    {
        cout << imgFiles[i] << endl;
        src = imread(imgFiles[i], IMREAD_GRAYSCALE);
        if (!src.empty())
        {
            threshold(src, binary, 120, 255, THRESH_BINARY_INV);
            number = scanOneImage(binary, number);
        }
    }

    return 0;
}
