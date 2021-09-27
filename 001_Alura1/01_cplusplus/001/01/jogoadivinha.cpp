//g++ jogoadivinha.cpp -o jogoadivinha
//./jogoadivinha
// Simple C++ program to display "Hello World"

// Header file for input output functions
#include<iostream>

using namespace std;

// main function -
// where the execution of program begins
int main()
{
	setlocale(LC_ALL,"pt_BR.UTF-8");
	// prints hello world
	cout << "vvvvvvvvvvvvvvvvvvvvvvv" <<endl;
	cout << "| Jogo da Adivinha‡Æo |" <<endl;
	cout << "^^^^^^^^^^^^^^^^^^^^^^^" <<endl;

	int numero_secreto = 42;

	cout << "Numero secreto ‚ " << numero_secreto << " , o sentido da vida." <<endl;


	return 0;
}
