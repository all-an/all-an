#include <iostream>
using namespace std;

int main()
{
    cout << "**************************************" << endl;
    cout << "*********  Guessing Game  ************" << endl;
    cout << "**************************************" << endl;

    const int SECRET_NUMBER = 42;

    bool not_hit = true;
    int attempts = 0;

	double score = 1000.0;

    while(not_hit){
        attempts++;
        int guess;
        cout << "Attempt " << attempts << endl;
        cout << "Guess a number? ";
        cin >> guess;

        double lost_score = abs(guess - SECRET_NUMBER)/2.0;
        score -= lost_score;

        cout << "You guess: " << guess << endl;
        bool hit = guess == SECRET_NUMBER;
        bool higher = guess > SECRET_NUMBER;

        if (hit)
        {
            cout << "Nice ! You guess the secret number !" << endl;
            not_hit = false;
        }
        else if (higher)
        {
            cout << "Your guess was higher !" << endl;
        }
        else
        {
            cout << "Your guess was lower !" << endl;
        }
    }
    cout << "The End !" << endl;
    cout << "You guess the secret number in " << attempts  << " attempts" << endl;

    cout.precision(2);
    cout << fixed;

    cout << "Your score was " << score << " points." << endl;
}